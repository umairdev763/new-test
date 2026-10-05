/**
 * inventory-results.js
 * Single AJAX fetch function for all boat listing pages.
 * Page context (all / new / used) is detected via getPageContext()
 * which is defined in inventory-filter-controls.js (loaded before this file).
 *
 * Dependencies (loaded before this file):
 *   inventory-filter-url.js      → updateFilterCounts(), updateBrowserUrl()
 *   inventory-filter-controls.js → getPageContext()
 *
 * Dependencies (loaded after this file, called at event-time only):
 *   custom.js                    → window.applyView(), initializeBoatSliders()
 */

function numberWithCommas(x) {
    return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function getBoats(no_boat_msg) {
    var ctx = getPageContext(); // 'new' | 'used' | 'all'
    var listingPageSlug = $('input[name="listing_page_slug"]').val();

    var data = {}
    var dataAttr = ctx === 'all' ? 'id' : 'name';
    $('.boat_filter').each(function () {
        data[$(this).attr(dataAttr)] = $(this).val()
    })

    // Always use the actual listing page slug so the session namespace matches
    // the form submit target — hardcoding used-pre-owned caused sort/filter state
    // to be read from the wrong session when on used-boats-for-sale.
    var url = '/' + listingPageSlug + '?json=true';

    document.getElementsByClassName("loader-wrapper")[0].style.display = "block"
    $.ajax({
        type: "POST",
        url: url,
        data: data,
        success: function (msg) {
            $("#updteRslt").text(`${msg.totalBoats} Listings`);

            if (!msg.success) {
                console.log(msg.msg, 'danger');
            } else {
                if (ctx === 'all') {
                    updateFilterCounts();
                }

                var allBoats = ``
                function PaymentLogic(loanAmount) {
                    if (!loanAmount || isNaN(parseFloat(loanAmount))) return "0";

                    const rawLoanAmount = parseFloat(loanAmount.toString().replace(/[$,]/g, ''));
                    const downPayment = rawLoanAmount * 0.20; // 20% down payment
                    const principalAmount = rawLoanAmount - downPayment;

                    const interestRate = 7.99;
                    const loanPeriod = 20; // years

                    const monthlyInterestRate = interestRate / 1200;
                    const numberOfPayments = 12 * loanPeriod;

                    const emi = (principalAmount * monthlyInterestRate * Math.pow(1 + monthlyInterestRate, numberOfPayments)) /
                        (Math.pow(1 + monthlyInterestRate, numberOfPayments) - 1);

                    const finalVal = Math.round(emi * 10) / 10;

                    return finalVal > 0
                        ? `${finalVal.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}`
                        : "0";
                }

                msg.boats.forEach(async (boat) => {
                    var dealer_name = boat.dealer_name ? boat.dealer_name : " "
                    var boatPermalink = boat.boatPermalink ? boat.boatPermalink : boat._id
                    var featuredImage = boat.productImage
                        ? boat.productImage
                        : (Array.isArray(boat.boatImages) && boat.boatImages.length > 0
                            ? boat.boatImages[0].image
                            : 'https://cdn.mdsbrand.com/madis/assets/images/no_image_available.jpg')
                    var boatName = boat.Name ? boat.Name.replace("Boats", "") : boat.boatTitle ? boat.boatTitle : ''

                    var boatYear = boat.boat_year ? boat.boat_year : ""
                    var boatcnd = boat.boat_condition ? boat.boat_condition : "N/A"
                    var boatwg = boat.boat_weight ? boat.boat_weight : "N/A"
                    var boatLength = boat.boat_length ? boat.boat_length : "N/A"
                    var boatMake = boat.boat_make ? boat.boat_make : ""
                    var boatModel = boat.boat_model ? boat.boat_model : ""
                    let boatPrice = boat.boatPrice ? '$' + numberWithCommas(boat.boatPrice) : "Request Pricing"
                    let gridBoatPrice = boat.boatPrice ? '$' + numberWithCommas(boat.boatPrice) : ""
                    var dry_weight = boat.dry_weight ? boat.dry_weight : ""
                    var capacity_weight = boat.capacity_weight ? boat.capacity_weight : ""
                    var boatcapacity = boat.boat_capacity ? boat.boat_capacity : ""
                    var enginemodel = boat.engine_model ? boat.engine_model : ""
                    var stocknmbr = boat.stock_number ? boat.stock_number : ""
                    var boatDescription = boat.boatDescription ? boat.boatDescription : ""
                    var image_banner = boat.boat_sale_status ? "<span class='boatTag closeTag'>" + boat.boat_sale_status + "</span>" : ""
                    var featured_txt = (boat.is_featured == 'Yes') ? "<p class='image_banner'>Featured Boat</p>" : ""
                    var _id = boat._id ? boat.id : ""
                    var detail_page_url = (boatcnd === 'New') ? "/new-boats-for-sale-detail/" + boatPermalink :
                        (boatcnd === 'Used') ? "/used-pre-owned-boats-for-sale-detail/" + boatPermalink : "#";
                    var engine_hours = boat.engine_hours ? boat.engine_hours : ""
                    var hullId = boat.hullId ? boat.hullId : ""

                    var priceLgoic = boat.boatPrice ? `<div class="pymentBlock"><h4> $${PaymentLogic(boat.boatPrice)}/month</h4><p>240 months, 7.99% APR <br> 20% Down Payment <br></p></div>` : "";
                    var gridpriceLgoic = boat.boatPrice ? `<li class="grid-price-item">$${PaymentLogic(boat.boatPrice)}/mo*</li` : "";
                    let carouselItems = '';
                    const noteBnr = boat.note;
                    let noteVal = '';
                    if (noteBnr) {
                        noteVal = `<span class="item_badge" style="position: absolute;right: 12px;top: 1%;"><a
												href="javascript:void(0)">${noteBnr}</a></span>`
                    }
                    if (Array.isArray(boat.boatImages)) {
                        boat.boatImages.forEach((imgObj) => {
                            carouselItems += `
                                                <div class="item">
                                                    <a href="${detail_page_url}">
                                                        <img src="${imgObj.image}" class="boat-img" alt="${boatPermalink}">
                                                    </a>
                                                    ${noteVal}
                                                </div>
                                            `;
                        });
                    } else {
                        carouselItems = `
                                            <div class="item">
                                                <a href="${detail_page_url}">
                                                    <img src="${featuredImage}" class="boat-img" alt="${boatPermalink}">
                                                </a>
                                                ${noteVal}
                                            </div>
                                                     `;
                    }

                    var html = `

                                <div class="boat-card list-view">

                                    <div class="boat-img-box">
                                        <a href="${detail_page_url}"><img src="${featuredImage}" class="boat-img" alt="${boatPermalink}"></a>
                                        ${noteVal}
                                    </div>

								<div class="boat-content-box">
									<div class="upper-content-box">

										<div class="sm-box-1">

											<h2 class="boat-title">
												<a
													href="${detail_page_url}">${boatName}
                                                </a>
											</h2>


											<div class="boat-condition-box">
												<ul class="boat-condition-list">

													${boatcnd? `<li><img src="https://cdn.mdsbrand.com/madis/assets/images/boat-details-icon/condition.png"
															alt=""> Condition: <span>${boatcnd}</span>
													</li>`:''}

													${boatLength? `<li><img src="https://cdn.mdsbrand.com/madis/assets/images/listing images/specs-list-img-1.png"
															alt="">Length: <span>${boatLength}'</span></li>`: ''}

													${stocknmbr? `<li><img src="https://cdn.mdsbrand.com/madis/assets/images/listing images/listing-icon-4.png" class="stock-img"
															alt="">Stock #: <span>${stocknmbr}</span></li>`: ''}

                                                    ${engine_hours? `<li><img src="https://cdn.mdsbrand.com/madis/assets/images/listing images/specs-list-img-3.png"
															alt="">Hours: <span>${engine_hours} hrs</span></li>`: ''}

                                                    ${hullId? `<li><img src="https://cdn.mdsbrand.com/madis/assets/images/listing images/listing-icon-4.png" class="stock-img"
															alt="">Serial: <span>${hullId}</span></li>`: ''}


												</ul>
											</div>

										</div>

										<div class="sm-box-2">
											<div class="pricing-box">

												<div class="price-per-month">


													<h3 class="card-text">${boatPrice}</h3>


													<div>
														<a href="${detail_page_url}" class="listing-blue-btn">VIEW DETAILS</a>
														<a href="https://secure.accelerate.dealer.com/dealer/24123" target="_blank" class="listing-skyblue-btn">GET PRE-aPPROVED</a>
													</div>
												</div>

											</div>
										</div>


									</div>



									${boatDescription ? `<div class="bottom-content-box">
										<div class="desc-box">
											<h3>DESCRIPTION</h3>
											<div class="listing-desc">${boatDescription} <a href="${detail_page_url}"
													class="read-more">MORE BOAT DETAILS</a></div>
										</div>
									</div>` : '' }

								</div>


							</div>


                                <div class="grid-boat-card grid-view">

								<div class="grid-boat-img-box">
									<a href="${detail_page_url}"><img src="${featuredImage}" class="boat-img" alt="${boatPermalink}"></a>
									${noteVal}
								</div>

								<div class="grid-boat-content-box">
									<div class="grid-upper-content-box">

										<div class="grid-sm-box-1">
											<h2 class="grid-boat-title">
												<a
													href="${detail_page_url}">${boatName}</a>
											</h2>

											<div class="grid-boat-condition-box">

												<div class="grid-price-box">
													${gridBoatPrice ? `
                                                        <ul>
                                                            <li class="grid-price-item">${gridBoatPrice}</li>
                                                            ${gridpriceLgoic}
                                                        </ul>`
                                                        :
                                                        `<a href="${detail_page_url}" class="grid-view-details-btn"> View Details</a>`
                                                    }


												</div>
												<ul class="grid-boat-condition-list">

                                                    ${boatcnd ? `<li class="specs-list-item"> <img
														src="https://cdn.mdsbrand.com/madis/assets/images/boat-details-icon/condition.png"
														alt=""> ${boatcnd}</li>` : ''}

													${boatLength ? `<li class="specs-list-item"> <img
														src="https://cdn.mdsbrand.com/madis/assets/images/listing images/specs-list-img-1.png"
														alt=""> ${boatLength}'</li>` : ''}


													${engine_hours ? `<li class="specs-list-item"><img
														src="https://cdn.mdsbrand.com/madis/assets/images/listing images/specs-list-img-3.png"
														alt=""> ${engine_hours} hrs</li>` : ''}

													${hullId ? `<li class="specs-list-item"><img
														src="https://cdn.mdsbrand.com/madis/assets/images/listing images/listing-icon-4.png" class="stock-img"
														alt="">${hullId}</li>` : ''}

												</ul>
											</div>

										</div>

									</div>

								</div>


							</div>

                    `;

                    allBoats += html

                })

                // --- Generic checkbox filter renderer ---
                // Builds desktop + mobile HTML for one checkbox panel using its FILTER_DEFS config.
                // Adding a new checkbox filter only requires a new SIDEBAR_FILTERS entry — no code change here.
                function renderCheckboxFilter(cfg, items) {
                    var selectedVal = $('#' + cfg.hiddenId).val() || '';
                    var selectedArr = (selectedVal && selectedVal !== '0') ? selectedVal.split(',').filter(Boolean) : [];
                    var desktop = '', mobile = '';

                    if (cfg.hasAll) {
                        var allChk = (selectedVal === '0' || selectedVal === '') ? 'checked' : '';
                        var allHtml = '<div class="sqr-checkBox"><label id="' + cfg.key + '_all">'
                            + '<input type="checkbox" ' + allChk + ' class="styled-checkbox"'
                            + ' onchange="filterCheckboxSelected(\'' + cfg.key + '\', this)"'
                            + ' name="' + cfg.checkboxName + '" autocomplete="off" value="all">'
                            + '<span class="filter_count"> All </span></label></div>';
                        desktop += allHtml;
                        mobile  += allHtml;
                    }

                    // Normalise a value for slug-vs-DB comparison:
                    // treat hyphens, slashes, and spaces as equivalent, ignore case.
                    function normVal(s) { return String(s).toLowerCase().replace(/[-\/]/g, ' ').replace(/\s+/g, ' ').trim(); }

                    (items || []).forEach(function(item) {
                        if (!item._id || item._id === '' || item._id === 'undefined') return;
                        var normId = normVal(item._id);
                        var chk = selectedArr.some(function(sv) {
                            return sv === item._id || normVal(sv) === normId;
                        }) ? 'checked' : '';
                        var count = item.count ? ' (' + item.count + ')' : '';
                        var row = '<div class="sqr-checkBox"><label id="' + cfg.key + '_' + item._id + '">'
                            + '<input ' + chk + ' type="checkbox"'
                            + ' class="styled-checkbox ' + cfg.key + '_' + item._id + '"'
                            + ' aria-labelledby="' + cfg.key + '_' + item._id + '"'
                            + ' onchange="filterCheckboxSelected(\'' + cfg.key + '\', this)"'
                            + ' name="' + cfg.checkboxName + '" value="' + item._id + '" autocomplete="off">'
                            + '<span class="filter_count"> ' + item._id + count + ' </span></label></div>';
                        desktop += row;
                        mobile  += row;
                    });

                    // If the AJAX response returned no options (or the selected value wasn't
                    // in the list), still render the currently-selected values as checked
                    // checkboxes so the user can see and deselect them.
                    var renderedNorms = (items || [])
                        .filter(function(i) { return i._id; })
                        .map(function(i) { return normVal(i._id); });
                    selectedArr.forEach(function(sv) {
                        if (!sv || sv === '0') return;
                        var alreadyShown = renderedNorms.some(function(n) { return n === normVal(sv); });
                        if (alreadyShown) return;
                        var row = '<div class="sqr-checkBox"><label>'
                            + '<input checked type="checkbox"'
                            + ' class="styled-checkbox"'
                            + ' onchange="filterCheckboxSelected(\'' + cfg.key + '\', this)"'
                            + ' name="' + cfg.checkboxName + '" value="' + sv + '" autocomplete="off">'
                            + '<span class="filter_count"> ' + sv + ' </span></label></div>';
                        desktop += row;
                        mobile  += row;
                    });

                    return { desktop: desktop, mobile: mobile };
                }

                // Build HTML for all checkbox panels in one pass
                var filterHtml = {};
                (window.FILTER_DEFS || []).filter(function(c) { return c.type === 'checkbox'; })
                    .forEach(function(cfg) {
                        filterHtml[cfg.key] = renderCheckboxFilter(cfg, msg[cfg.dataKey]);
                    });

                let loadMorepag = ``

                $('.load_more_action').attr('data-current_page', msg.current_page);
                $('.load_more_action').attr('data-page_count', msg.pageCount);

                if (ctx === 'all') {
                    if (msg.pageCount > 0) {
                        if (!no_boat_msg) {
                            $('.zero-inventory').css('display', 'none');
                        }
                        if (msg.pageCount != msg.current_page) {
                            loadMorepag += `	<button data-ajax_url="/${listingPageSlug}?load_more=1" data-current_page="${msg.current_page}" data-page_count="${msg.pageCount}" class="load_more_action boat_load_btn">Load More</button>`
                            jQuery('.load_more_action').show();
                        } else {
                            jQuery('.load_more_action').hide();
                        }
                    } else {
                        $('.zero-inventory').css('display', 'block');
                    }
                } else {
                    if (msg.pageCount != msg.current_page) {
                        loadMorepag += `	<button data-ajax_url="/${listingPageSlug}?load_more=1" data-current_page="${msg.current_page}" data-page_count="${msg.pageCount}" class="load_more_action boat_load_btn">Load More</button>`
                        jQuery('.load_more_action').show();
                    } else {
                        jQuery('.load_more_action').hide();
                    }
                }

                // --- Update range sliders from AJAX response ---
                // Loops over FILTER_DEFS range entries — no code change needed when adding a range filter.
                (window.FILTER_DEFS || []).filter(function(c) { return c.type === 'range'; })
                    .forEach(function(cfg) {
                        // Skip if the server response doesn't include this range's keys,
                        // or if both are 0 (no data in DB for this field — slider was never
                        // initialised so calling .slider('option') would throw an error).
                        if (msg[cfg.minKey] == null || msg[cfg.maxKey] == null) return;
                        if (msg[cfg.minKey] === 0 && msg[cfg.maxKey] === 0) return;

                        var stored   = $('#' + cfg.hiddenId).val() || '0';
                        var rawParts = stored !== '0' ? stored.replace(/[a-z]/gi, '').split('-') : [];
                        var sMin     = rawParts.length === 2 ? parseFloat(rawParts[0]) : null;
                        var sMax     = rawParts.length === 2 ? parseFloat(rawParts[1]) : null;
                        var newMin   = (sMin !== null && sMin > msg[cfg.minKey]) ? sMin : msg[cfg.minKey];
                        var newMax   = (sMax !== null && sMax < msg[cfg.maxKey]) ? sMax : msg[cfg.maxKey];

                        function fmtRange(v) {
                            if (cfg.isCurrency) return '$' + Number(v).toLocaleString();
                            return v + (cfg.unit ? ' ' + cfg.unit : '');
                        }

                        $('#' + cfg.displayId).val(fmtRange(newMin) + ' - ' + fmtRange(newMax));
                        if (cfg.mobDisplayId) $('#' + cfg.mobDisplayId).val(fmtRange(newMin) + ' - ' + fmtRange(newMax));
                        if (cfg.minValId) $('#' + cfg.minValId).text(fmtRange(newMin));
                        if (cfg.maxValId) $('#' + cfg.maxValId).text(fmtRange(newMax));
                        if (cfg.mobMinId) $('#' + cfg.mobMinId).text(fmtRange(newMin));
                        if (cfg.mobMaxId) $('#' + cfg.mobMaxId).text(fmtRange(newMax));

                        var $r   = $('#' + cfg.rangeId);
                        var $mob = $('#' + cfg.mobRangeId);
                        if ($r.data('ui-slider')) {
                            // min must come before max: _setOption('max') triggers _calculateNewMax()
                            // which reads this.options.min — must be a valid number first.
                            // Do NOT include step: it triggers _calculateNewMax before min is set.
                            $r.slider('option', { min: (stored === '0' ? newMin : msg[cfg.minKey]), max: msg[cfg.maxKey], values: [newMin, newMax] });
                        }
                        if ($mob.data('ui-slider')) {
                            $mob.slider('option', { min: msg[cfg.minKey], max: msg[cfg.maxKey], values: [newMin, newMax] });
                        }

                        if (stored !== '0') {
                            $('#' + cfg.hiddenId).val(newMin + '-' + newMax);
                        }
                    });

                // --- Write boat cards and load-more pagination ---
                document.getElementById('boats-list').innerHTML = allBoats;
                document.getElementById('loadMore_pag').innerHTML = loadMorepag;

                // --- Write checkbox filter panels from filterHtml ---
                // Loops over keys built by renderCheckboxFilter above.
                Object.keys(filterHtml).forEach(function(key) {
                    var el = document.getElementById(key + '-filter');
                    if (el) el.innerHTML = filterHtml[key].desktop;
                    var mob = document.getElementById(key + '-filter-mob');
                    if (mob) mob.innerHTML = filterHtml[key].mobile;
                });

                setTimeout(() => {
                    const view = localStorage.getItem('boatView') || 'list';
                    window.applyView(view);
                }, 100);

                initializeBoatSliders();

                // Update browser URL with SEO-friendly filter path
                updateBrowserUrl();
            }
        },
        complete: function () {
            document.getElementsByClassName("loader-wrapper")[0].style.display = "none"
        }
    })
}
