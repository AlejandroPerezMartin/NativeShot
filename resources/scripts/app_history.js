function initAppPage(aArg) {
	// aArg is what is received by the call in `init`
	store.dispatch(overwriteGalleryItems(hydrant_ex.logsrc));

	gAppPageComponents = [
		React.createElement(MagnificContainer),
		React.createElement(BarsContainer),
		React.createElement(FiltersContainer),
		React.createElement(PaginationContainer),
		React.createElement(GalleryContainer, { layouts:gGalleryLayouts })
	];
}

function uninitAppPage() {

}

var focusAppPage; // undefined for now, as i dont want focus events during dev

// start - react-redux

function getDisplayFilters(selected_filter) {
	var services = core.nativeshot.services;

	var display_filters = []; // element is an object
	if (selected_filter == 'all') {
		// add all types without duplicates
		var types = new Set();
		for (var serviceid in services) {
			var entry = services[serviceid];

			if (entry.history_ignore) { continue; }

			types.add(entry.type);
		}
		// put into array so i can later sort it
		for (var type of types) {
			display_filters.push({
				serviceid: type,
				label: formatStringFromNameCore('filter_' + type, 'main')
			});
		}
	} else {
		// selected_filter is either a `serviceid` or a `type`
		var type;
		if (selected_filter in services) {
			type = services[selected_filter].type;
		} else {
			// else its a `type`
			type = selected_filter;
		}

		for (var serviceid in services) {
			var entry = services[serviceid];

			if (entry.history_ignore) { continue; }
			if (entry.type != type) { continue; }

			display_filters.push({
				serviceid,
				label: core.addon.l10n.main['filter_' + serviceid] || formatStringFromNameCore(serviceid, 'main')
			});
		}
	}

	// sort in `label` alpha
	display_filters.sort((a,b) => a.label.localeCompare(b.label));

	return display_filters;
}

var gGalleryLayouts = [ // must be in order from largest breakpoint to lowest
	{
		name: 'xxxlg',
		breakpoint: 99999999, // gallery_width <= this then it qualifies for xxxlg
		cols: 3 // col_width will be total gallery width DIVIDED BY this
	},
	{
		name: 'lg',
		breakpoint: 1200,
		cols: 3
	},
	{
		name: 'md',
		breakpoint: 996,
		cols: 3
	},
	{
		name: 'sm',
		breakpoint: 768,
		cols: 2
	},
	{
		name: 'xs',
		breakpoint: 480,
		cols: 1
	}
];

var gImageInfoLoading = {}; // object where key is the `item.src`, so link39193888 knows not to kick off another `loadImageForEntry` // value is true, if a `item.src` not in here, then its not loading AND EITHER it was never requested to load with `loadImageForEntry` OR `image_info` object was set in `item`
function loadImageForEntry(aEntry) {
	var info = {
		ok: undefined // `undefined` when loading, `false` when error, `true` when loaded and ready
		// reason: undefined // this is populated when `ok` is set to `false`
		// height: // set when `ok` is set to true
		// width: // set when `ok` is set to true
		// src: // set when `ok` is set to true
	};

	var image = new Image();

	// start async-proc94833
	var prelims = function() {
		if (aEntry.src.startsWith('file')) {
			callInBootstrap('makeResourceURI', aEntry.src, aResourceURI => {
				info.src = aResourceURI;
				loadit();
			});
		} else {
			info.src = aEntry.src;
			loadit();
		}
	};

	var loadit = function() {
		image.src = info.src;
	};

	image.onerror = function() {
		info.reason = formatStringFromNameCore('imgerror_load', 'main', [aEntry.path || aEntry.src]); // TODO
		info.ok = false;
		injectInfoIntoState();
	};
	image.onabort = function() {
		info.reason = 'ERROR: loading somehow aborted'; // TODO
		info.ok = false;
		injectInfoIntoState();
	};
	image.onload = function() {
		info.height = image.naturalHeight;
		info.width = image.naturalWidth;
		info.ok = true;
		injectInfoIntoState();
	};

	var injectInfoIntoState = function() {
		store.dispatch(injectGalleryImageInfo(aEntry.src, info));
	};

	prelims();
	// end async-proc94833

}

// REACT COMPONENTS - PRESENTATIONAL
var Filters = React.createClass({
	render: function() {
		var { selected_filter } = this.props; // mapped state
		var { setFilter } = this.props; // dispatchers

		var display_filters = getDisplayFilters(selected_filter);

		var services = core.nativeshot.services;
		if (selected_filter == 'all') {
			display_filters.splice(0, 0, {serviceid:'all', label:formatStringFromNameCore('filter_all', 'main')});
		} else {
			var all_of_type;
			if (services[selected_filter]) {
				all_of_type = services[selected_filter].type;
			} else {
				all_of_type = selected_filter;
			}
			display_filters.splice(0, 0, {serviceid:all_of_type, label:formatStringFromNameCore('filter_all_' + all_of_type, 'main')});
			display_filters.splice(0, 0, {serviceid:'all', label:formatStringFromNameCore('back', 'main')});
		}

		// `rel` is like `domel` it means react element
		var buttons_rel = display_filters.map(el => React.createElement('button', { className:(selected_filter == el.serviceid ? 'selected' : undefined), onClick:setFilter.bind(null, el.serviceid) },
			el.label
		));

		return React.createElement('div', { className:'padd-20' },
			React.createElement('div', { className:'row' },
				React.createElement('div', { id:'filters' },
					buttons_rel
				)
			)
		);
	}
});

var Bars = React.createClass({
	shouldComponentUpdate: function(nextProps, nextState) {
		var filter = this.props.selected_filter;
		var newfilter = nextProps.selected_filter;
		if (filter !== newfilter) {
			return true;
		}

		var items = this.props.all_items;
		var newitems = nextProps.all_items;
		if (items.length !== newitems.length) {
			return true;
		} else {
			var l = items.length;
			for (var i=0; i<l; i++) {
				if (items[i].t !== newitems[i].t) {
					return true;
				}
			}
		}
	},
	render: function() {
		var { selected_filter, all_items } = this.props; // mapped state
		var { setFilter } = this.props; // dispatchers

		const MAX_COL = 3;

		var display_filters = getDisplayFilters(selected_filter);
		var services = core.nativeshot.services;

		var log = all_items;
		if (selected_filter == 'all') {
			// get counts by type (`serviceid` in `filter_entry` is actually `type`)
			for (var filter of display_filters) {
				filter.cnt = log.filter( log_entry => getServiceFromCode(log_entry.t).entry.type === filter.serviceid ).length;
			}
		} else {
			// get counts of `serviceid`s in `display_filters`
			for (var filter of display_filters) {
				filter.cnt = log.filter( log_entry => log_entry.t === services[filter.serviceid].code ).length;
			}

			if (services[selected_filter]) {
				// `serviceid` is filtered
			} else {
				// no `serviceid` filtered, just `type` of `selected_filter`
			}
		}

		// get max cnt, set percent
		var max_cnt = 1;
		for (var filter of display_filters) {
			if (filter.cnt > max_cnt) {
				max_cnt = filter.cnt;
			}
		}

		// make 100% cnt be 5% more then max_cnt
		var hundred_cnt = max_cnt + (.05 * max_cnt);

		// set percent
		for (var filter of display_filters) {
			filter.per = Math.round((filter.cnt / hundred_cnt) * 100);
		}

		var serviceid_cnt = display_filters.length;

		var col_rels = [
			[], // col1
			[], // col2
			[] // col3
		];

		function animLine(per, el) {
			if (el) {
				window.getComputedStyle(el, '').width; // if i dont do this first, then the width wont transition/animate per bug1041292 - https://bugzilla.mozilla.org/show_bug.cgi?id=1041292#c3
				el.style.width = per + '%';
			} // else its null meaning el was unmounted
		}

		var colnum = 0;
		for (var filter of display_filters) {
			col_rels[colnum].push(
				React.createElement('div', { key:filter.serviceid, className:'service', onClick:setFilter.bind(null, filter.serviceid) },
					React.createElement('div', { className:'lblcnt' },
						filter.label,
						React.createElement(CountTo, { transition:'ease', duration:2000, mountval:0, end:filter.cnt })
					),
					React.createElement('div', { className:'line-bg' },
						React.createElement('div', { className:'line-fill', ref:animLine.bind(null, filter.per) })
					)
				)
			);
			if (++colnum === MAX_COL) {
				colnum = 0;
			}
		}

		var grid_class;
		if (col_rels[2].length) {
			grid_class = 'col-md-4 col-sm-6 col-xs-12';
		} else if (col_rels[1].length) {
			grid_class = 'col-md-6 col-sm-6 col-xs-12';
		} else {
			grid_class = 'col-md-12 col-sm-12 col-xs-12';
		}

		return React.createElement('div', { id:'bars', className:'padd-40', onClick:this.view },
			React.createElement('div', { className:'row' },
				React.createElement('div', { className:grid_class },
					col_rels[0]
				),
				!col_rels[1].length ? undefined : React.createElement('div', { className:grid_class },
					col_rels[1]
				),
				!col_rels[2].length ? undefined : React.createElement('div', { className:grid_class }, // `grid_class` was "'col-md-4 col-sm-8 col-sm-offset-2 col-md-offset-0 col-xs-12'"
					col_rels[2]
				)
			)
		);
	}
});

function filterGalleryItemsBySelected(gallery_items, selected_filter) {
	var services = core.nativeshot.services;

	var items;
	if (selected_filter == 'all') {
		items = gallery_items;
	} else {
		if (services[selected_filter]) {
			// `serviceid` is filtered
			var selected_code = services[selected_filter].code;
			items = gallery_items.filter(entry => entry.t === selected_code );
		} else {
			// no `serviceid` filtered, just `type` of `selected_filter`
			items = gallery_items.filter(entry => getServiceFromCode(entry.t).entry.type === selected_filter );
		}
	}

	return items.filter(entry => !getServiceFromCode(entry.t).entry.noimg);
}

var gGalleryAnimated = false;
var Gallery = React.createClass({
	render: function() {
		var { layouts } = this.props; // attr
		var { selected_filter, width, all_items, page, perpage } = this.props; // mapped state
		var { setFilter } = this.props; // dispatchers

		var display_filters = getDisplayFilters(selected_filter);
		var services = core.nativeshot.services;

		// console.log('all_items:', all_items);

		var item_rels;
		if (width > 0) { // so we dont render when gallery width is not yet set
			var layout = layouts.reduce( (pre, el) => width <= el.breakpoint ? el : pre );

			var colwidth = Math.round(width / layout.cols);
			var colwidthpx = colwidth + 'px';

			var items = filterGalleryItemsBySelected(all_items, selected_filter);

			items = items.slice((page-1)*perpage, ((page-1)*perpage)+perpage);

			// console.log('items:', items);

			var running_colheight = [];
			for (var i=0; i<layout.cols; i++) {
				running_colheight.push(0);
			}

			const GALENTRY_MIN_HEIGHT = 200;
			const GALITEM_IMAGE_MARGIN = 5; // must match crossfile-link173771

			item_rels = items.map( (entry, i) => {
				var col = i % layout.cols; // base 0
				var row = Math.floor(i / layout.cols);

				if (row > 0 && layout.cols > 1) {
					// find shortest col
					var shortest_col = running_colheight.reduce( (pre, el, i, arr) => i === 1 ? (el < pre ? i /*obviously 1*/ : i - 1 /*obviously 0*/) : (el < arr[pre] ? i : pre) )
					// if (Math.abs(running_colheight[shortest_col] - running_colheight[col]) > 75) {
					// 	alert(running_colheight[shortest_col] + ' vs ' + running_colheight[col] + '\n\n' + Math.abs(running_colheight[shortest_col] - running_colheight[col]) + '\n\n' + running_colheight);
					// 	// if the shortest_col is short by a lot, then use it. if its not short by a lot, then continue with where it should be placed.
					// 	col = shortest_col;
					// }
					col = shortest_col;
				}

				var translate_x = col * colwidth;
				if (isLocaleRTL()) {
					translate_x *= -1;
				}
				var translate_y = running_colheight[col];
				var transform = 'translate(' + translate_x + 'px, ' + translate_y + 'px)';

				var item_rel;
				var item_attr = { key:entry.d, className:'galentry', style:{width:colwidthpx, transform} };

				var image_info = entry.image_info;
				if (image_info) { // link39193888 - two ways to check if, check gImageInfoLoading or entry.image_info
					// if image_entry.ok is undefined it means its still loading
					if (image_info.ok) {

						// add to `running_colheight` this images height
						var display_img_width = colwidth - (GALITEM_IMAGE_MARGIN * 2);
						var scale_factor = display_img_width / image_info.width;
						var display_img_height = Math.round(image_info.height * scale_factor);
						if (display_img_height < GALENTRY_MIN_HEIGHT) {
							display_img_height = GALENTRY_MIN_HEIGHT - (GALITEM_IMAGE_MARGIN * 2);
						}

						var display_img_top = translate_y + GALITEM_IMAGE_MARGIN;
						if (!isLocaleRTL()) {
							var display_img_left = translate_x + GALITEM_IMAGE_MARGIN;
						} else {
							var display_img_left = (-1 * translate_x) + GALITEM_IMAGE_MARGIN;
						}
						var display_item_width = colwidth;
						var display_item_height = display_img_height + (GALITEM_IMAGE_MARGIN * 2);

						running_colheight[col] += display_item_height;

						// item_attr['data-display-item-dims'] = display_item_width + ' x ' + display_item_height;
						// item_attr['data-display-img-dims'] = display_img_width + ' x ' + display_img_height;
						// item_attr['data-img-dims'] = image_info.width + ' x ' + image_info.height;

						item_rel = [
							React.createElement(SliphoverContainer, { entry, display_img_dims:{width:display_img_width, height:display_img_height, top:display_img_top, left:display_img_left} }),
							React.createElement('img', { src:image_info.src }) // i dont do `entry.src` because like in case of file uri, the `image.src` is a resource uri and not the origianl which is `entry.src`
						];
					} else {
						// failed
						running_colheight[col] += GALENTRY_MIN_HEIGHT;
						item_rel = [
							React.createElement(SliphoverContainer, { entry, display_img_dims:null }),
							React.createElement('div', { className:'flex-center' },
								image_info.reason
							)
						];
					}
				} else {
					if (!gImageInfoLoading[entry.src]) {
						// link39193888
						gImageInfoLoading[entry.src] = true;
						setTimeout(loadImageForEntry.bind(null, entry), 0);
					}
					running_colheight[col] += GALENTRY_MIN_HEIGHT;
					item_rel = [
						React.createElement(SliphoverContainer, { entry, display_img_dims:null }),
						React.createElement('div', { className:'uil-default-css' },
							[0, 36, 72, 108, 144, 180, 216, 252, 288, 324].map( deg => React.createElement('div', {style:{transform:'rotate('+deg+'deg) translate(0,-60px)'}}) )
						)
					];
				}

				return React.createElement(GalleryItem, item_attr,
					item_rel
				);
			});

			if (!items.length) {
				item_rels = React.createElement(GalleryItem, { key:selected_filter, className:'galentry', style:{width:(layout.cols*colwidth)+'px', transform:'translate(0, 0)'} },
					React.DOM.div({ className:'no-images' },
						formatStringFromNameCore('no_images_in_filter', 'main')
					)
				);
			}
		} else {
			item_rels = undefined;
		}

		if (width > 0 && !gGalleryAnimated && !document.getElementById('app_wrap').getAttribute('class').includes('animsition')) {
			gGalleryAnimated = true;
		}

		return React.createElement(ReactTransitionGroup, { component:'div', id:'gallery', className:'padd-80' + (gGalleryAnimated ? ' galsition' : '') },
			item_rels
		);
	},
	componentDidMount: function() {
		window.addEventListener('resize', this.resize, false);

		// console.error('gal width on mount:', ReactDOM.findDOMNode(this).offsetWidth);
		store.dispatch(setGalleryWidth(ReactDOM.findDOMNode(this).offsetWidth));
	},
	resize: function() {
		var domel = ReactDOM.findDOMNode(this);
		var width = domel.offsetWidth;

		console.log('width:', width);
		store.dispatch(setGalleryWidth(width));
	}
});

var GalleryItem = React.createClass({
	render: function() {
		var attr = {};
		for (var p in this.props) {
			if (p != 'children' && p != 'ref' && p != 'key') {
				if (p == 'style') {
					attr[p] = Object.assign({}, this.props[p]);
				} else {
					attr[p] = this.props[p];
				}
			}
		}
		if (gGalleryAnimated && !this.entered) {
			// console.error('applied trans and opac, kkey:', this.props.kkey);
			attr.style.transform += ' scale(0.01)'; // cant scale to 0, otherwise it also translates to 0,0. so i do 0.01
			attr.style.opacity = 0.01;
		}
		// else { console.error('NOT APPLYING trans and opac', 'gGalleryAnimated:', gGalleryAnimated, 'entered:', this.entered, 'kkey:', this.props.kkey); }
		return React.DOM.div(attr,
			this.props.children
		);
	},
	entered: false,
	// componentDidMount: function() {
	// 	console.error('comp did mount! kkey:', this.props.kkey, 'entered:', this.entered);
	// },
	// componentWillUnmount: function() {
	// 	console.error('will UNMOUNT');
	// },
	// componentWillAppear: function(callback) {
	// 	console.error('will appear');
	// 	callback();
	// },
	// componentDidAppear: function() {
	// 	console.error('did appear');
	// },
	componentWillEnter: function(callback) {
		// console.error('will enter, kkey:', this.props.kkey, this.props.kkey ? ReactDOM.findDOMNode(this).style.transform : undefined);
		this.entered = true;
		if (!gGalleryAnimated) {
			callback();
		} else {
			var domel = ReactDOM.findDOMNode(this);
			window.getComputedStyle(domel, '').transform; // SOMETIEMS trans fails, so just do this everytime // if i dont do this first, then the width wont transition/animate per bug1041292 - https://bugzilla.mozilla.org/show_bug.cgi?id=1041292#c3
			// console.error('this.props.style.transform:', this.props.style.transform);
			domel.style.transform = this.props.style.transform + ' scale(1)';
			domel.style.opacity = 1;
			setTimeout(callback, 301);
		}
	},
	// componentDidEnter: function() {
	// 	console.error('did enter');
	// },
	componentWillLeave: function(callback) {
		// console.error('will leave, transform:', this.props.style.transform);
		if (!gGalleryAnimated) {
			callback();
		} else {
			var domel = ReactDOM.findDOMNode(this);
			domel.style.transform = this.props.style.transform + ' scale(0.01)'; // cant scale to 0, otherwise it also translates to 0,0. so i do 0.01
			domel.style.opacity = 0;
			setTimeout(callback, 301);
		}
	}
	// componentDidLeave: function() {
	// 	console.error('did leave');
	// }
});

var Magnific = React.createClass({
	render: function() {
		var { magnific } = this.props; // mapped state

		if (!magnific) {
			if (this.showing) {
				this.didHide();
			}
			return null;
		} else {
			if (!this.showing) {
				this.didShow();
			}

			var { entry, src, from } = magnific; // attr
			// `from` should have w, h, x, y
			// `to` should have w, h

			if (!isLocaleRTL()) {
				var fromattr = 'left';
			} else {
				var fromattr = 'right';
			}
			return React.createElement('div', { id:'magnific' },
				React.createElement('div', {id:'magnific_cover', onClick:this.close }),
				React.createElement('button', { id:'magnific_close', onClick:this.close },
					'\u00D7'
				),
				React.createElement('img', { ref:this.imgDidOunt, src, style:{width:from.w+'px', height:from.h+'px', top:(from.y - document.documentElement.scrollTop)+'px', [fromattr]:(from.x - document.documentElement.scrollLeft)+'px'} } ),
				React.createElement('div', { ref:'tools', id:'magnific_tools', style:{opacity:'0'} },
					React.createElement('a', { className:'fa_popup-iconic', onClick:this.opentab, href:entry.src },
						formatStringFromNameCore('open_in_tab', 'main')
					)
				)
			);
		}
	},
	opentab: function(e) {
		if (!stopClickAndCheck0(e)) { return }

		var { magnific } = this.props;

		var { entry } = magnific;
		callInBootstrap('loadOneTab', {
			URL: entry.src,
			params: {
				inBackground: false
			}
		});
	},
	transition_ms: 313, // should match transition duration in app.ss crossfile-link291
	close: function(e) {
		if (e.button === 0) {
			var { close } = this.props; // dispatchers
			this.refs.tools.style.opacity = '0';
			this.putImgBack();
			setTimeout(close, this.transition_ms);
		}
	},
	putImgBack: null, // set
	showing: false,
	didHide: function() {
		this.showing = false;
		this.img_mounted = false;
		this.putImgBack = null;

		document.documentElement.style.overflow = '';
		window.removeEventListener('keydown', this.keydown, false);
	},
	didShow: function() {

		this.showing = true;

		document.documentElement.style.overflow = 'hidden'; // blocks scrolling
		window.addEventListener('keydown', this.keydown, false);
	},
	keydown: function(e) {
		if (e.key == 'Escape') {
			this.close({button:0});
		}
	},
	img_mounted: false,
	imgDidOunt: function(domel) {
		// either mounted or unmounted, if `domel` is `null` then it unmounted
		if (domel) {
			if (this.img_mounted) {
				console.warn('img already mounted, i dont know why it called domel ref callback again when it was already mounted!');
				return;
			} else {

				var { magnific } = this.props; // mapped state
				var { to } = magnific;

				this.img_mounted = true;
				window.getComputedStyle(domel, '').width; // if i dont do this first, then the width wont transition/animate per bug1041292 - https://bugzilla.mozilla.org/show_bug.cgi?id=1041292#c3

				// animate dimensions and position of image
				var viewport_height = window.innerHeight;
				var viewport_width = window.innerWidth;

				var natural_img_width = to.w;
				var natural_img_height = to.h;

				var max_img_width = .85 * viewport_width; // match crossfile-link8383831
				var max_img_height = .78 * viewport_height; // match crossfile-link83838312

				var scale_based_on_width;
				if (natural_img_width > max_img_width) {
					scale_based_on_width = max_img_width / natural_img_width;
				} else {
					scale_based_on_width = 1;
				}

				var scale_based_on_height;
				if (natural_img_height > max_img_height) {
					scale_based_on_height = max_img_height / natural_img_height;
				} else {
					scale_based_on_height = 1;
				}

				console.log('scale_based_on_width:', scale_based_on_width);
				console.log('scale_based_on_height:', scale_based_on_height);

				var scale = Math.min(scale_based_on_height, scale_based_on_width);
				console.log('scale:', scale);

				var to_img_width = Math.round(scale * natural_img_width);
				var to_img_height = Math.round(scale * natural_img_height);
				console.log('from:', magnific.from.w, 'x', magnific.from.h);
				console.log('to:', to_img_width, 'x', to_img_height);

				var to_img_top = Math.round((viewport_height / 2) - (to_img_height / 2));
				var to_img_left = Math.round((viewport_width / 2) - (to_img_width / 2));

				var toattr = !isLocaleRTL() ? 'left' : 'right';
				window.getComputedStyle(domel, '').width; // if i dont do this first, then the width wont transition/animate per bug1041292 - https://bugzilla.mozilla.org/show_bug.cgi?id=1041292#c3 // ACTUALLY while working on RTL support in 1.10b.rev11 i think i saw i dont need this
				domel.style.width = to_img_width + 'px';
				domel.style.height = to_img_height + 'px';
				domel.style[toattr] = to_img_left + 'px';
				domel.style.top = to_img_top + 'px';

				setTimeout(function() {
					this.refs.tools.style.opacity = '1';
				}.bind(this), this.transition_ms);

				this.putImgBack = function() {
					var { from } = magnific;

					domel.style.width = from.w + 'px';
					domel.style.height = from.h + 'px';
					domel.style[toattr] = (from.x - document.documentElement.scrollLeft) + 'px';
					domel.style.top = (from.y - document.documentElement.scrollTop) + 'px';
				};
			}
		}
	}
});

// start - slipcover button functions
function workerWithEntry(entry, verb) {
	// verb - "forget_d", "trash", "delete"

	var { d } = entry;

	var l10n_key = verb;
	var worker_method;
	var worker_arg;
	switch (verb) {
		case 'forget_d':
				l10n_key = 'forget';
				worker_method = 'removeFromLogD';
				worker_arg = entry.d;
			break;
		case 'trash':
				if (entry.t === core.nativeshot.services.savebrowse.code || entry.t === core.nativeshot.services.savequick.code) {
					worker_method = 'trashEntry';
					worker_arg = entry.d;
					break;
				} else {
					// its `dropbox`
					// dont break, so it goes into the `case 'delete'`
				}
			// break; // dont break, as if its not `savebrowse` or `savequick`, like `dropbox`, then it should go into 'delete'
		case 'trash': // only for `dropbox`
		case 'delete':
				worker_method = 'processAction';
				worker_arg = {
					serviceid: getServiceFromCode(entry.t).serviceid,
					actionid: Date.now(),
					action_options: {
						alt_action: verb,
						d
					}
				};
			break;
	}

	store.dispatch(showCover(d, 'message', formatStringFromNameCore('title_' + l10n_key, 'main'), formatStringFromNameCore('processing_' + l10n_key, 'main')));

	callInMainworker(worker_method, worker_arg, function(aArg) {
		var { __PROGRESS, reason } = aArg;

		var buttons = [
			{
				icon: 'fa_reply',
				label: formatStringFromNameCore('back', 'main'),
				func: 'uncover'
			}
		];

		if (__PROGRESS) {
			var error_txt;
			switch (reason) {
				case 'HOLD_USER_AUTH_NEEDED':
						buttons.push({
							icon: 'fa_popup-iconic',
							label: formatStringFromNameCore('reauth_button', 'main'),
							func: 'reauth'
						});

						store.dispatch(showCover(d, 'message', formatStringFromNameCore('title_' + l10n_key, 'main'), formatStringFromNameCore('manual_auth_needed', 'main'), buttons));
					break;
				case 'SERVER_RETRY_WAIT':
					var { data } = aArg;
					error_txt = formatStringFromNameCore('server_retry_wait', 'main', [data.countdown]);
					// break; // dont break so it goes into default section
				default:
					if (!error_txt) {
						error_txt = reason;
					}
					// no buttons for message updates due to progress
					store.dispatch(showCover(d, 'message', formatStringFromNameCore('title_' + l10n_key, 'main'), error_txt));
			}
		} else {
			if (reason == 'SUCCESS') {
				store.dispatch(removeGalleryItemsBy('d', d));
			} else {

				var error_txt;
				switch (reason) {
					case 'ABORT_ERROR':
							var { subreason, data } = aArg;
							var { error_details } = data;
							error_txt = error_details;

							switch (subreason) {
								case 'UNHANDLED_STATUS_CODE':
										buttons.push({
											icon: 'fa_popup-iconic',
											label: formatStringFromNameCore('show_error', 'main'),
											func: 'showError',
											data: {
												response: data.response_details.response
											}
										});
									break;
							}
						break;
					default:
						error_txt = reason;
				}
				store.dispatch(showCover(d, 'message', formatStringFromNameCore('title_' + l10n_key, 'main'), formatStringFromNameCore('error_' + l10n_key, 'main', [error_txt]), buttons));
			}
		}
	});
}
// end - slipcover button functions

var Sliphover = React.createClass({
	view: function(e) {
		if (!stopClickAndCheck0(e)) { return }

		// magnific image
		var { entry, display_img_dims } = this.props; // attr

		if (!entry.image_info.ok) {
			callInBootstrap('loadOneTab', {
				URL: entry.src,
				params: {
					inBackground: false
				}
			});
		} else {
			var gallery_domel = document.getElementById('gallery');

			store.dispatch(showMagnific(
				{
					entry,
					src: entry.image_info.src,
					from: {
						w: display_img_dims.width,
						h: display_img_dims.height,
						x: display_img_dims.left + gallery_domel.offsetLeft,
						y: display_img_dims.top + gallery_domel.offsetTop
					},
					to: {
						w: entry.image_info.width,
						h: entry.image_info.height
					}
				}
			));
		}

	},
	forget: function(e) {
		if (!stopClickAndCheck0(e)) { return }

		var { entry } = this.props; // attr

		this.onConfirm = workerWithEntry.bind(null, entry, 'forget_d');
		store.dispatch(showCover(entry.d, 'confirm', formatStringFromNameCore('title_forget', 'main'), formatStringFromNameCore('confirm_forget', 'main')));
	},
	copy: function(e) {
		if (!stopClickAndCheck0(e)) { return }

		var { entry } = this.props; // attr

		callInBootstrap('copy', entry.path || entry.src);
	},
	open: function(e) {
		if (!stopClickAndCheck0(e)) { return }

		var { entry } = this.props; // attr

		switch (entry.t) {
			case core.nativeshot.services.savebrowse.code:
			case core.nativeshot.services.savequick.code:
					callInBootstrap('commShowFileInOSExplorer', entry.src);
				break;
			default:
				callInBootstrap('loadOneTab', {
					URL: entry.p,
					params: {
						inBackground: false
					}
				});
		}
	},
	trash: function(e) {
		if (!stopClickAndCheck0(e)) { return }

		var { entry } = this.props; // attr

		// only for services.savequick and services.savebrowse
		this.onConfirm = workerWithEntry.bind(null, entry, 'trash');
		store.dispatch(showCover(entry.d, 'confirm', formatStringFromNameCore('title_trash', 'main'), formatStringFromNameCore('confirm_trash', 'main')));
	},
	delete: function(e) {
		if (!stopClickAndCheck0(e)) { return }

		var { entry } = this.props; // attr

		this.onConfirm = workerWithEntry.bind(null, entry, 'delete');
		store.dispatch(showCover(entry.d, 'confirm', formatStringFromNameCore('title_delete', 'main'), formatStringFromNameCore('confirm_delete', 'main')));

	},
	gui_data: null,
	onConfirm: null,
	confirm: function(e) {
		// onConfirm must be set
		if (!stopClickAndCheck0(e)) { return }
		if (!this.onConfirm) { console.error('deverror: onConfirm not set!!'); return; } // remove on production

		this.onConfirm();
		this.onConfirm = null;
	},
	uncover: function(e) {
		if (!stopClickAndCheck0(e)) { return }
		var { entry } = this.props;
		var { d } = entry;

		this.onConfirm = null; // in case there was one
		this.gui_data = null;
		store.dispatch(uncover(d));
	},
	reauth: function(e) {
		if (!stopClickAndCheck0(e)) { return }

		var { entry } = this.props; // attr

		var { serviceid } = getServiceFromCode(entry.t);

		callInMainworker('openAuthTab', serviceid);
	},
	showError: function(e) {
		if (!stopClickAndCheck0(e)) { return }

		callInBootstrap('beautifyJs', this.gui_data.response, function(aBeautified) {
			alert(aBeautified);
		});
	},
	render: function() {
		var { entry } = this.props; // attr
		var { slipcover } = this.props; // mapped state

		var services = core.nativeshot.services;
		var code_info = getServiceFromCode(entry.t);

		// create galslip_rel
		var galslip_rel;
		if (!slipcover) {
			var button_rels;
			switch (entry.t) {
				case services.savebrowse.code:
				case services.savequick.code:
						button_rels = [
							React.createElement('a', { href:entry.src, className:'fa_eye', onClick:this.view },
								formatStringFromNameCore('view', 'main')
							),
							React.createElement('a', { className:'fa_link', onClick:this.copy },
								formatStringFromNameCore('just_copy', 'main')
							),
							React.createElement('a', { className:'fa_folder-open', onClick:this.open },
								formatStringFromNameCore('open', 'main')
							),
							React.createElement('a', { className:'fa_trash', onClick:this.trash },
								formatStringFromNameCore('trash', 'main')
							),
							React.createElement('a', { className:'fa_history', onClick:this.forget },
								formatStringFromNameCore('forget', 'main')
							)
						];
					break;
				case services.imgur.code:
				case services.imguranon.code:
				case services.gdrive.code:
						button_rels = [
							React.createElement('a', { href:entry.src, className:'fa_eye', onClick:this.view },
								formatStringFromNameCore('view', 'main')
							),
							React.createElement('a', { className:'fa_link', onClick:this.copy },
								formatStringFromNameCore('just_copy', 'main')
							),
							React.DOM.br(),
							React.createElement('a', { className:'fa_cancel', onClick:this.delete },
								formatStringFromNameCore('delete', 'main')
							),
							React.createElement('a', { className:'fa_history', onClick:this.forget },
								formatStringFromNameCore('forget', 'main')
							)
						];
					break;
				case services.dropbox.code:
						button_rels = [
							React.createElement('a', { href:entry.src, className:'fa_eye', onClick:this.view },
								formatStringFromNameCore('view', 'main')
							),
							React.createElement('a', { className:'fa_link', onClick:this.copy },
								formatStringFromNameCore('just_copy', 'main')
							),
							React.DOM.br(),
							React.createElement('a', { className:'fa_trash', onClick:this.trash },
								formatStringFromNameCore('trash', 'main')
							),
							React.createElement('a', { className:'fa_history', onClick:this.forget },
								formatStringFromNameCore('forget', 'main')
							)
						];
					break;
				case services.twitter.code:
				case services.facebook.code:
						button_rels = [
							React.createElement('a', { href:entry.src, className:'fa_eye', onClick:this.view },
								formatStringFromNameCore('view', 'main')
							),
							React.createElement('a', { className:'fa_link', onClick:this.copy },
								formatStringFromNameCore('just_copy', 'main')
							),
							React.DOM.br(),
							React.createElement('a', { href:entry.p, className:'fa_' + code_info.serviceid, onClick:this.open },
								formatStringFromNameCore(code_info.serviceid == 'twitter' ? 'open_tweet' : 'open_post', 'main')
							),
							React.createElement('a', { className:'fa_history', onClick:this.forget },
								formatStringFromNameCore('forget', 'main')
							)
						];
					break;
			}

			galslip_rel = React.createElement('div', { className:'slip-transition', key:'innate' },
				React.createElement('div', { className:'galslip' },
					React.createElement('h4', null,
						formatTime(entry.d)
					),
					React.createElement('h5', null,
						formatStringFromNameCore(code_info.serviceid, 'main')
					),
					!entry.u ? undefined : React.createElement('h6', null,
						entry.s
					),
					button_rels
				)
			);
		} else {
			var { form, title, body, buttons } = slipcover;

			var button_rels;
			if (form == 'confirm') {
				button_rels = [
					React.createElement('a', { className:'fa_ok', onClick:this.confirm },
						formatStringFromNameCore('okay', 'main')
					),
					React.createElement('a', { className:'fa_cancel', onClick:this.uncover },
						formatStringFromNameCore('cancel', 'main')
					)
				];
			} else if (buttons) {
				button_rels = [];
				for (var button of buttons) {
					// button is an object
						// icon - "fa_..." // NOTE: must NOT be "fa-" but should be "fa_", as the underscore signifies its in the pseudo element, otherwise it stylizes the button label font
						// label - string
						// func - string
					var { icon, label, func, data } = button;
					if (data) {
						this.gui_data = data;
					}
					button_rels.push(React.createElement('a', { className:(icon ? icon : undefined), onClick:this[func] },
						label
					));
				}
			}

			var key = title; // form == 'confirm' ? 'confirm' : title;
			galslip_rel = React.createElement('div', { className:'slip-transition', key },
				React.createElement('div', { className:'galslip' },
					React.createElement('h4', null,
						title
					),
					React.createElement('p', null,
						body
					),
					button_rels
				)
			);
		}

		return React.createElement('div', { className:'slip-container slip-dark' + (slipcover ? ' slipcover' : '') },
			React.createElement(ReactCSSTransitionGroup, getTrans('slideleftright', { component:'div', className:'slip-overlay' }),
				galslip_rel
			)
		);
	}
});

var Pagination = React.createClass({
	shouldComponentUpdate: function(nextProps, nextState) {
		var page = this.props.page;
		var newpage = nextProps.page;
		if (page !== newpage) {
			return true;
		}

		var filter = this.props.selected_filter;
		var newfilter = nextProps.selected_filter;
		if (filter != newfilter) {
			return true;
		}

		var items = this.props.gallery_items;
		var newitems = nextProps.gallery_items;
		if (items.length != newitems.length) {
			return true;
		}
	},
	render: function() {
		var { page, perpage, gallery_items, selected_filter } = this.props; // mapped state
		var { setPage } = this.props; // dispatchers

		var items = filterGalleryItemsBySelected(gallery_items, selected_filter);

		var pages = Math.ceil(items.length / perpage);

		if (!items.length || pages === 1) {
			return React.createElement('div', { id:'pagination' },
				React.createElement('div', { className:'onpage' }, ' ')
			);
		} else {
			var rel = [];
			for (var i=1; i<=pages; i++) {
				rel.push( React.createElement(PageNumber, { num:i, page, setPage }) );
			}
			return React.createElement('div', { id:'pagination' },
				rel
			);
		}
	}
});

var PageNumber = React.createClass({
	setPage: function() {
		var { num, setPage } = this.props;
		setPage(num);
	},
	render: function() {
		var { num, page } = this.props;
		var attr = {};
		if (num === page) {
			attr.className = 'onpage';
		} else {
			attr.onClick = this.setPage;
		}
		return React.createElement('div', attr,
			num
		);
	}
});
// REACT COMPONENTS - CONTAINER
var FiltersContainer = ReactRedux.connect(
	function mapStateToProps(state, ownProps) {
		return {
			selected_filter: state.selected_filter
		}
	},
	function mapDispatchToProps(dispatch, ownProps) {
		return {
			setFilter: serviceid => dispatch(setFilter(serviceid))
		}
	}
)(Filters);

var PaginationContainer = ReactRedux.connect(
	function mapStateToProps(state, ownProps) {
		return {
			page: state.page,
			perpage: 20,
			selected_filter: state.selected_filter,
			gallery_items: state.gallery_items
		}
	},
	function mapDispatchToProps(dispatch, ownProps) {
		return {
			setPage: page => dispatch(setPage(page))
		}
	}
)(Pagination);

var BarsContainer = ReactRedux.connect(
	function mapStateToProps(state, ownProps) {
		return {
			selected_filter: state.selected_filter,
			all_items: state.gallery_items
		}
	},
	function mapDispatchToProps(dispatch, ownProps) {
		return {
			setFilter: serviceid => dispatch(setFilter(serviceid))
		}
	}
)(Bars);

var GalleryContainer = ReactRedux.connect(
	function mapStateToProps(state, ownProps) {
		return {
			selected_filter: state.selected_filter,
			width: state.gallery_width,
			all_items: state.gallery_items,
			page: state.page,
			perpage: 20
		}
	},
	function mapDispatchToProps(dispatch, ownProps) {
		return {

		}
	}
)(Gallery);

var MagnificContainer = ReactRedux.connect(
	function mapStateToProps(state, ownProps) {
		return {
			magnific: state.magnific
		}
	},
	function mapDispatchToProps(dispatch, ownProps) {
		return {
			close: () => dispatch(closeMagnific())
		}
	}
)(Magnific);

var SliphoverContainer = ReactRedux.connect(
	function mapStateToProps(state, ownProps) {
		return {
			slipcover: state.slipcover[ownProps.entry.d]
		}
	},
	function mapDispatchToProps(dispatch, ownProps) {
		return {

		}
	}
)(Sliphover);

// material for app.js
var gAppPageNarrow = false;

var gAppPageHeaderProps = {
	type: 3,
	get text() { return formatStringFromNameCore('header_text_dashboard', 'main') },
	menu: [
		{
			 get text() { return formatStringFromNameCore('history', 'main') },
		},
		{
			 get text() { return formatStringFromNameCore('options', 'main') },
			 href: 'about:nativeshot?options'
		},
		{
			 get text() { return formatStringFromNameCore('authorization', 'main') },
			 href: 'about:nativeshot?auth'
		}
	]
};

var gAppPageComponents; // done in init as needs l10n

var hydrant;
var hydrant_ex = {
	logsrc: []
};
var hydrant_ex_instructions = {
	logsrc: true
}

function shouldUpdateHydrantEx() {} // need empty function, as i dont update any file with `logsrc` // need a function as `store.subscribe` is ran on `shouldUpdateHydrantEx` when `hydrant_ex_instructions` is present

// ACTIONS
const SET_FILTER = 'SET_FILTER';

const OVERWRITE_GALLERY_ITEMS = 'OVERWRITE_GALLERY_ITEMS';
const ADD_GALLERY_ITEMS = 'ADD_GALLERY_ITEMS';
const INJECT_GALLERY_IMAGE_INFO = 'INJECT_GALLERY_IMAGE_INFO';
const REMOVE_GALLERY_ITEMS_BY = 'REMOVE_GALLERY_ITEMS_BY';

const SET_GALLERY_WIDTH = 'SET_GALLERY_WIDTH';

const SHOW_MAGNIFIC = 'SHOW_MAGNIFIC';
const CLOSE_MAGNIFIC = 'CLOSE_MAGNIFIC';

const SHOW_COVER = 'SHOW_COVER';
const UNCOVER = 'UNCOVER';

const SET_PAGE = 'SET_PAGE';

// ACTION CREATORS
function overwriteGalleryItems(items) {
	// should only call this on `init`
	return {
		type: OVERWRITE_GALLERY_ITEMS,
		items
	}
}

function injectGalleryImageInfo(src, info) {
	// `src` is the `src` in `item` NOT the resource uri `src` found in `info.src` if its a file://
	return {
		type: INJECT_GALLERY_IMAGE_INFO,
		src,
		info
	}
}

function addGalleryItems(items) {
	return {
		type: ADD_GALLERY_ITEMS,
		items
	}
}

function removeGalleryItemsBy(by, value) {
	// by - "t", "d"
	return {
		type: REMOVE_GALLERY_ITEMS_BY,
		by,
		value
	}
}

function setGalleryWidth(width) {
	return {
		type: SET_GALLERY_WIDTH,
		width
	}
}

function setFilter(serviceid) {
	// `serviceid` is a string. a key in `core.nativeshot.services` (except ones marked `history_ignore` like "ocrall") OR "all"
	return {
		type: SET_FILTER,
		serviceid
	}
}


function showMagnific(mag_info) {
	return {
		type: SHOW_MAGNIFIC,
		mag_info
	}
}

function closeMagnific() {
	return {
		type: CLOSE_MAGNIFIC
	}
}

function showCover(d, form, title, body, buttons) {
	// form is enum string - "message","cover"
		// if "message", then buttons can be set
	return {
		type: SHOW_COVER,
		d,
		form,
		title,
		body,
		buttons
	}
}

function uncover(d) {
	return {
		type: UNCOVER,
		d
	}
}

function setPage(page) {
	return {
		type: SET_PAGE,
		page
	}
}

// REDUCERS
function selected_filter(state='all', action) {
	switch (action.type) {
		case SET_FILTER:
			return action.serviceid;
		default:
			return state;
	}
}

function gallery_items(state=[], action) {
	switch (action.type) {
		case OVERWRITE_GALLERY_ITEMS:
			return action.items;
		case ADD_GALLERY_ITEMS:
			var new_state = [ ...action.items, ...state ];
			new_state.sort((a,b) => b.d-a.d); // crossfile-link189391
			return new_state;
		case REMOVE_GALLERY_ITEMS_BY:
			var { by, value } = action;
			if (state.find(el => el[by] === value)) {
				return state.filter( el => el[by] !== value );
			} else {
				return state;
			}
		case INJECT_GALLERY_IMAGE_INFO:
			var { src, info } = action;
			return state.map(item => {
				if (item.src && item.src == src) { // `noimg` type entries in the log (`item`) dont have a `src`
					return Object.assign({}, item, {
						image_info: info
					});
				} else {
					return item;
				}
			});
		default:
			return state;
	}
}

// console.error('document.documentElement.offsetWidth:', document.documentElement.offsetWidth);
// var gGalleryWidthDefault = document.documentElement.offsetWidth - 123;
function gallery_width(state=0, action) {
	switch (action.type) {
		case SET_GALLERY_WIDTH:
			return action.width;
		default:
			return state;
	}
}

function magnific(state=null, action) {
	switch (action.type) {
		case SHOW_MAGNIFIC:
			var { entry, src, from, to } = action.mag_info;
			return { entry, src, from, to };
		case CLOSE_MAGNIFIC:
			return null;
		default:
			return state;
	}
}

function slipcover(state={}, action) {
	switch (action.type) {
		case SHOW_COVER:
			var { d, form, title, body, buttons } = action;
			return Object.assign({}, state, {
				[d]: { form, title, body, buttons }
			});
		case UNCOVER:
			var { d } = action;
			var new_state = Object.assign({}, state);
			delete new_state[d];
			return new_state;
		default:
			return state;
	}
}

function page(state=1, action) {
	switch (action.type) {
		case SET_FILTER:
			return 1;
		case SET_PAGE:
			return action.page;
		default:
			return state;
	}
}

// `var` so app.js can access it
var app = Redux.combineReducers({
	selected_filter,
	page,
	gallery_width,
	gallery_items,
	magnific,
	slipcover
});

// end - react-redux

function getServiceFromCode(servicecode) {
	// exact copy in bootstrap.js, MainWorker.js, app_history.js
	// console.log('getting service from id of:', servicecode);
	for (var a_serviceid in core.nativeshot.services) {
		if (core.nativeshot.services[a_serviceid].code === servicecode) {
			return {
				serviceid: a_serviceid,
				entry: core.nativeshot.services[a_serviceid]
			};
		}
	}
}

function commDispatch(aArg) {
	var { m, a } = aArg;
	store.dispatch(gCommScope[m](...a));
}

function isLocaleRTL() {
	switch (core.firefox.locale) {
		case 'ar': // Arabic
		case 'dv': // Divehi
		case 'fa': // Persian (Farsi)
		case 'ha': // Hausa
		case 'he': // Hebrew
		case 'iw': // Hebrew (old code)
		case 'ji': // Yiddish (old code)
		case 'ps': // Pashto, Pushto
		case 'ur': // Urdu
		case 'yi': // Yiddish
			return true;
		default:
			return false;
	}
}
