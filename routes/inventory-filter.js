'use strict';

/**
 * routes/inventory-filter.js
 * Copied from mean-idaho-master/routes/inventory-filter.js
 *
 * Stripped:
 *   - colors (replaced with plain console.error)
 *   - schema-builders (sb) — not filter-related
 *   - common.selectMenu / getInventoryMenu / getMainPageStyles / getMainPageScripts
 *     / showCartCloseBtn — replaced with empty stubs; add back when needed
 *
 * Everything else is identical to the reference repo.
 */

const express      = require('express');
const router       = express.Router();
const common       = require('../lib/common');
const inventoryUrl = require('../lib/inventory-url');

// ---------------------------------------------------------------------------
// 301 Redirects — deprecated URL patterns
// ---------------------------------------------------------------------------

router.get('/used-pre-owned-boats-for-sale', (req, res) => {
    res.redirect(301, '/used-boats-for-sale');
});

router.get('/pre-owned-boats-for-sale', (req, res) => {
    res.redirect(301, '/used-boats-for-sale');
});

router.get('/used-pre-owned-boats-for-sale-detail/:id', (req, res) => {
    res.redirect(301, '/used-boats-for-sale-detail/' + req.params.id);
});

// ---------------------------------------------------------------------------
// SEO-Friendly Inventory Filter Route
// ---------------------------------------------------------------------------

router.all(
    /^\/(boats-for-sale|new-boats-for-sale|used-boats-for-sale)(-[a-z0-9-]+)?(?:\/((?:type-|make-|model-|search-|price-|year-|length-|hours-|engine_make-|engine-make-|horse_power-|horse-power-|horsepower-|hourse_power-|page-)[a-z0-9+\/_\\-]*))?\/?\s*$/i,
    async (req, res, next) => {
        const hasLocation = /^\/(boats-for-sale|new-boats-for-sale|used-boats-for-sale)-[a-z0-9-]/i.test(req.path);
        const hasFilter   = /\/(type-|make-|model-|search-|price-|year-|length-|hours-|engine_make-|engine-make-|horse_power-|horse-power-|horsepower-|hourse_power-|page-)/.test(req.path);

        if (!hasLocation && !hasFilter) return next();

        const db     = req.app.db;
        const config = req.app.config;
        req.body = req.body || {};   // guard GET requests

        // ---- Parse URL ----
        const parsed = inventoryUrl.parseFilterUrl(req.path);

        if (parsed.location && /-id$/i.test(parsed.location)) {
            const canonicalLocation = parsed.location.replace(/-id$/i, '');
            const redirectPath = inventoryUrl.buildFilterUrl(
                parsed.basePath,
                canonicalLocation,
                parsed.filters,
                parsed.page,
                true
            );
            const queryStr = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
            return res.redirect(301, redirectPath + queryStr);
        }

        if (!parsed.basePath) {
            return res.status(404).render('error', {
                title:   'Not found',
                message: 'Page not found',
            });
        }

        // ---- Build MongoDB filter from URL segments ----
        const filter = inventoryUrl.buildMongoFilter(parsed.filters, parsed.condition, req.query);

        // ---- SEO meta ----
        const canonicalUrl = inventoryUrl.buildCanonicalUrl(req, parsed.basePath, parsed.location, parsed.filters);
        const noindex      = inventoryUrl.shouldNoindex(req.query, parsed.filters);

        // ---- Pagination ----
        let currentPage    = req.query.current_page ? parseInt(req.query.current_page) : (parsed.page || 1);
        let numberProducts = config.productsPerPage ? config.productsPerPage : 12;

        // ---- Sorting ----
        var sort_by = {};
        var activeSortKey = (req.body && req.body.sort_by) || req.query.sort || 'year-newest_to_oldest';

        switch (activeSortKey) {
            case 'year-newest_to_oldest':      sort_by.boat_year   = -1; break;
            case 'year-oldest_to_newest':      sort_by.boat_year   =  1; break;
            case 'price-high_to_low':          sort_by.boatPrice   = -1; break;
            case 'price-low_to_high':          sort_by.boatPrice   =  1; break;
            case 'length-longest_to_shortest': sort_by.boat_length = -1; break;
            case 'length-shortest_to_longest': sort_by.boat_length =  1; break;
            case 'year-asc':    sort_by.boat_year   =  1; break;
            case 'year-desc':   sort_by.boat_year   = -1; break;
            case 'price-asc':   sort_by.boatPrice   =  1; break;
            case 'price-desc':  sort_by.boatPrice   = -1; break;
            case 'length-asc':  sort_by.boat_length =  1; break;
            case 'length-desc': sort_by.boat_length = -1; break;
            default:            sort_by.boat_year   = -1; break;
        }

        try {
            const results = await common.getBoatData(req, currentPage, filter, sort_by);

            // ---- JSON response for AJAX filter updates (?json=true) ----
            if (req.query.json === 'true') {
                return res.status(200).json({
                    success:        true,
                    boats:          results.data,
                    boat:           true,
                    boat_condition: results.boat_condition,
                    totalBoats:     results.totalProducts,
                    boat_brand:     results.boat_brand,
                    boat_model:     results.boat_model,
                    boat_series:    results.boat_series,
                    boat_class:     results.boat_class,
                    boat_category:  results.category,
                    engine_make:    results.engine_make,
                    maxLength:      results.max_Length[0] ? results.max_Length[0].boat_length : 0,
                    minLength:      results.min_Length[0] ? results.min_Length[0].boat_length : 0,
                    maxYear:        results.max_year[0]   ? results.max_year[0].boat_year     : 0,
                    minYear:        results.min_year[0]   ? results.min_year[0].boat_year     : 0,
                    maxPrice:       results.max_price[0]  ? results.max_price[0].boatPrice    : 0,
                    minPrice:       results.min_price[0]  ? results.min_price[0].boatPrice    : 0,
                    maxHorsePower:  results.max_horse_power[0] ? parseFloat(results.max_horse_power[0].hourse_power) || 0 : 0,
                    minHorsePower:  results.min_horse_power[0] ? parseFloat(results.min_horse_power[0].hourse_power) || 0 : 0,
                    pageCount:      results.pageCount,
                    current_page:   parseInt(currentPage),
                    canonicalUrl:   canonicalUrl,
                });
            }

            // ---- Load More — return HTML snippet ----
            if (req.query.load_more == 1) {
                return res.json(buildLoadMoreResponse(results, currentPage));
            }

            // ---- Full page render ----
            const { pageTitle, metaDescription } = buildPageMeta(parsed);

            // Slug → DB name matching for session pre-checking
            var catList       = (results.category  || []).filter(function(item) { return item._id; });
            var brandList     = (results.boat_brand || []).filter(function(item) { return item._id; });
            var modelList     = (results.boat_model || []).filter(function(item) { return item._id; });
            var engineMakeList = (results.engine_make || []).filter(function(item) { return item._id; });

            function matchCategorySlug(slug) {
                var unslug = inventoryUrl.unslugify(slug);
                var match  = catList.find(function(c) { return new RegExp(unslug, 'i').test(c._id); });
                return match ? match._id : unslug;
            }
            function matchBrandSlug(slug) {
                var unslug = inventoryUrl.unslugify(slug);
                var match  = brandList.find(function(b) { return b._id.toLowerCase() === unslug.toLowerCase(); });
                return match ? match._id : unslug;
            }
            function matchModelSlug(slug) {
                var unslug = inventoryUrl.unslugify(slug);
                var match  = modelList.find(function(m) { return m._id.toLowerCase() === unslug.toLowerCase(); });
                return match ? match._id : unslug;
            }
            function matchEngineMakeSlug(slug) {
                var unslug = inventoryUrl.unslugify(slug);
                var match  = engineMakeList.find(function(e) { return e._id.toLowerCase() === unslug.toLowerCase(); });
                return match ? match._id : unslug;
            }

            let matchedCategory = 0;
            if (parsed.filters.type) {
                var typeSlugs = Array.isArray(parsed.filters.type) ? parsed.filters.type : [parsed.filters.type];
                if (req.query.type) {
                    var extraTypes = Array.isArray(req.query.type) ? req.query.type : [req.query.type];
                    typeSlugs = typeSlugs.concat(extraTypes);
                }
                matchedCategory = typeSlugs.map(matchCategorySlug).join(',');
            }

            let matchedBrand = 0;
            if (parsed.filters.make) {
                var makeSlugs = Array.isArray(parsed.filters.make) ? parsed.filters.make : [parsed.filters.make];
                if (req.query.make) {
                    var extraMakes = Array.isArray(req.query.make) ? req.query.make : [req.query.make];
                    makeSlugs = makeSlugs.concat(extraMakes);
                }
                matchedBrand = makeSlugs.map(matchBrandSlug).join(',');
            }

            let matchedModel = 0;
            if (parsed.filters.model) {
                var modelSlugs = Array.isArray(parsed.filters.model) ? parsed.filters.model : [parsed.filters.model];
                if (req.query.model) {
                    var extraModels = Array.isArray(req.query.model) ? req.query.model : [req.query.model];
                    modelSlugs = modelSlugs.concat(extraModels);
                }
                matchedModel = modelSlugs.map(matchModelSlug).join(',');
            }

            let matchedEngineMake = 0;
            var engineMakeParam = req.query.engine_make || req.query['engine-make'];
            if (parsed.filters.engine_make) {
                var engineMakeSlugs = Array.isArray(parsed.filters.engine_make) ? parsed.filters.engine_make : [parsed.filters.engine_make];
                if (engineMakeParam) {
                    var extraEngineMakes = Array.isArray(engineMakeParam) ? engineMakeParam : [engineMakeParam];
                    engineMakeSlugs = engineMakeSlugs.concat(extraEngineMakes);
                }
                matchedEngineMake = engineMakeSlugs.map(matchEngineMakeSlug).join(',');
            } else if (engineMakeParam) {
                var queryEngineMakes = Array.isArray(engineMakeParam) ? engineMakeParam : [engineMakeParam];
                matchedEngineMake = queryEngineMakes.map(matchEngineMakeSlug).join(',');
            }

            var hpVal = 0;
            if (parsed.filters.horse_power) {
                hpVal = parsed.filters.horse_power.min + '-' + parsed.filters.horse_power.max;
            } else if (req.query.horse_power || req.query['horse-power'] || req.query.hourse_power) {
                hpVal = (req.query.horse_power || req.query['horse-power'] || req.query.hourse_power).toString().replace(/hp$/i, '');
            }

            // Session-compatible data structure for boats.hbs
            const sessionData = {
                condition_val:   parsed.condition || 0,
                brand_val:       matchedBrand,
                boat_type_val:   0,
                category_val:    matchedCategory,
                model_val:       matchedModel,
                year_val:        parsed.filters.year   ? parsed.filters.year.min   + '-' + parsed.filters.year.max   : 0,
                length_val:      parsed.filters.length ? parsed.filters.length.min + '-' + parsed.filters.length.max : 0,
                pricemax_val:    parsed.filters.price  ? parsed.filters.price.min  + '-' + parsed.filters.price.max  : 0,
                boat_name_val:   parsed.filters.search || 0,
                location_val:    0,
                class_val:       0,
                series_val:      0,
                engine_make_val: matchedEngineMake,
                horse_power_val: hpVal,
                sort_by:         activeSortKey,
            };

            results.category = (results.category || []).filter(item => item._id);

            const templateData = {
                boat_condition: results.boat_condition,
                boat_brand:     results.boat_brand,
                boat_category:  results.category,
                boat_class:     results.boat_class,
                boat_model:     results.boat_model,
                boat_series:    results.boat_series,
                engine_make:    results.engine_make,
                minLength:      results.min_Length[0] ? results.min_Length[0].boat_length : 0,
                maxLength:      results.max_Length[0] ? results.max_Length[0].boat_length : 0,
                minYear:        results.min_year[0]   ? results.min_year[0].boat_year     : 0,
                maxYear:        results.max_year[0]   ? results.max_year[0].boat_year     : 0,
                minPrice:       results.min_price[0]  ? results.min_price[0].boatPrice    : 0,
                maxPrice:       results.max_price[0]  ? results.max_price[0].boatPrice    : 0,
                minHorsePower:  results.min_horse_power[0] ? parseFloat(results.min_horse_power[0].hourse_power) || 0 : 0,
                maxHorsePower:  results.max_horse_power[0] ? parseFloat(results.max_horse_power[0].hourse_power) || 0 : 0,
            };
            const filterPanels = inventoryUrl.buildFilterPanels(templateData, sessionData);

            let search_word = '';
            if (parsed.basePath === 'used-boats-for-sale') {
                search_word = (req.session.used_search_val && req.session.used_search_val !== '0') ? req.session.used_search_val : '';
            } else {
                search_word = (req.session.new_search_val && req.session.new_search_val !== '0') ? req.session.new_search_val : '';
            }

            return res.render('boats', {
                title:             pageTitle + ' | ' + config.siteName,
                search_word:       search_word,
                metaDescription:   metaDescription,
                canonicalUrl:      canonicalUrl,
                noindex:           noindex,
                query_text:        pageTitle,
                page:              'boats_page',
                pageType:          parsed.basePath,
                results:           results.data,
                boat_condition:    results.boat_condition,
                boat_brand:        results.boat_brand,
                boat_category:     results.category,
                boat_type:         results.boat_type,
                boat_class:        results.boat_class,
                boat_model:        results.boat_model,
                boat_series:       results.boat_series,
                engine_make:       results.engine_make,
                pageCount:         results.pageCount,
                maxLength:         results.max_Length[0] ? results.max_Length[0].boat_length : 0,
                minLength:         results.min_Length[0] ? results.min_Length[0].boat_length : 0,
                maxYear:           results.max_year[0]   ? results.max_year[0].boat_year     : 0,
                minYear:           results.min_year[0]   ? results.min_year[0].boat_year     : 0,
                maxPrice:          results.max_price[0]  ? results.max_price[0].boatPrice    : 0,
                minPrice:          results.min_price[0]  ? results.min_price[0].boatPrice    : 0,
                maxHorsePower:     results.max_horse_power[0] ? parseFloat(results.max_horse_power[0].hourse_power) || 0 : 0,
                minHorsePower:     results.min_horse_power[0] ? parseFloat(results.min_horse_power[0].hourse_power) || 0 : 0,
                current_page:      parseInt(currentPage),
                session:           sessionData,
                message:           '',
                messageType:       '',
                productsPerPage:   numberProducts,
                totalProductCount: results.totalProducts,
                belowSliderBoats:  results.belowSliderBoats,
                pageNum:           1,
                paginateUrl:       req.path.replace(/\/page-\d+/i, '').replace(/^\//, '').replace(/\/$/, ''),
                pageTitle:         pageTitle,
                showFooter:        'showFooter',
                basePath:          parsed.basePath,
                locationSlug:      parsed.location || '',
                locationSlugs:     JSON.stringify(inventoryUrl.getLocationSlugs()),
                filterConfig:      JSON.stringify(inventoryUrl.FILTER_CONFIG),
                filterDefs:        JSON.stringify(inventoryUrl.SIDEBAR_FILTERS),
                filterPanels:      filterPanels,
            });

        } catch (err) {
            console.error('Error in SEO filter route:', err);
            return res.status(500).render('error', {
                title:   'Error',
                message: 'An error occurred while loading inventory',
            });
        }
    }
);

// ---------------------------------------------------------------------------
// Helper: Build page title and meta description
// (copied exactly from reference repo)
// ---------------------------------------------------------------------------

function buildPageMeta(parsed) {
    const condition = parsed.condition || '';

    let locationDisplay = '';
    if (parsed.location) {
        const locSlug = parsed.location.replace(/-id$/i, '');
        locationDisplay = inventoryUrl.unslugify(locSlug).replace(/\b\w/g, l => l.toUpperCase());
    }

    let makeDisplay = '';
    if (parsed.filters.make) {
        const makeVals = Array.isArray(parsed.filters.make) ? parsed.filters.make : [parsed.filters.make];
        makeDisplay = makeVals.map(v => inventoryUrl.unslugify(v).replace(/\b\w/g, l => l.toUpperCase())).join(', ');
    }

    let typeDisplay = '';
    if (parsed.filters.type) {
        const typeVals = Array.isArray(parsed.filters.type) ? parsed.filters.type : [parsed.filters.type];
        typeDisplay = typeVals.map(v => inventoryUrl.unslugify(v).replace(/\b\w/g, l => l.toUpperCase())).join(', ');
    }

    let conditionLabel = condition === 'New' ? 'New Boats' : condition === 'Used' ? 'Used Boats' : 'Boats';
    let pageTitle = conditionLabel + ' For Sale';
    if (locationDisplay) pageTitle += ' in ' + locationDisplay + ', ID';
    if (makeDisplay)     pageTitle += ' - ' + makeDisplay;
    if (typeDisplay)     pageTitle += ' - ' + typeDisplay;

    const conditionWord  = condition === 'New' ? 'new ' : condition === 'Used' ? 'used ' : '';
    const makePhrase     = makeDisplay ? makeDisplay + ' ' : '';
    const typePhrase     = typeDisplay ? typeDisplay + ' ' : '';
    const boatKind       = makePhrase + typePhrase + 'boats';
    const locationPhrase = locationDisplay ? ' in ' + locationDisplay + ', ID' : '';
    const qualityWord    = condition === 'Used' ? 'quality pre-owned ' : conditionWord;

    let metaDescription;
    if (condition === 'New') {
        metaDescription = `Shop new ${boatKind} for sale${locationPhrase}. Browse our latest inventory and find your perfect new boat today.`;
    } else if (condition === 'Used') {
        metaDescription = `Find ${qualityWord}${boatKind} for sale${locationPhrase}. Browse our pre-owned inventory and get a great deal.`;
    } else {
        metaDescription = `Shop ${boatKind} for sale${locationPhrase}. Explore new and used options and find your next boat today.`;
    }

    return { pageTitle, metaDescription };
}

// ---------------------------------------------------------------------------
// Helper: Build Load More HTML response
// (copied exactly from reference repo)
// ---------------------------------------------------------------------------

function buildLoadMoreResponse(results, currentPage) {
    var Numberfrmt  = Intl.NumberFormat();
    var result_html = '';

    function PaymentLogic(loanAmount) {
        if (!loanAmount || isNaN(parseFloat(loanAmount))) return '0';
        var rawLoanAmount   = parseFloat(loanAmount.toString().replace(/[$,]/g, ''));
        var downPayment     = rawLoanAmount * 0.20;
        var principalAmount = rawLoanAmount - downPayment;
        var monthlyRate     = 7.99 / 1200;
        var numPayments     = 12 * 20;
        var emi = (principalAmount * monthlyRate * Math.pow(1 + monthlyRate, numPayments)) /
                  (Math.pow(1 + monthlyRate, numPayments) - 1);
        var finalVal = Math.round(emi * 10) / 10;
        return finalVal > 0
            ? finalVal.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 2 })
            : '0';
    }

    for (var i = 0; i < results.data.length; i++) {
        var boat = results.data[i];

        var link = boat.boat_condition === 'New'
            ? '/new-boats-for-sale-detail/'  + boat.boatPermalink
            : '/used-pre-owned-boats-for-sale-detail/' + boat.boatPermalink;

        var boatimg = boat.productImage
            ? boat.productImage
            : 'https://cdn.mdsbrand.com/madis/assets/images/no_image_available.jpg';

        var tt = '';
        if      (boat.sale_status === 'For Sale')        tt = '<p class="for_sale_image_banner image_banner">In Stock</p>';
        else if (boat.sale_status === 'Production Slot') tt = '<p class="production_image_banner image_banner">Available to Customize</p>';
        else if (boat.sale_status === 'Pending Sale')    tt = '<p class="production_image_banner image_banner">Pending Sale</p>';
        else if (boat.sale_status === 'On The Way')      tt = '<p class="on_the_way_image_banner image_banner">' + boat.sale_status + '</p>';

        var price_html      = boat.boatPrice ? '  $' + Numberfrmt.format(boat.boatPrice) : 'Request Pricing';
        var grid_price_html = boat.boatPrice ? '  $' + Numberfrmt.format(boat.boatPrice) : '';

        var note = boat.note;
        var noteVal = '';
        if (note) {
            noteVal = '<span class="item_badge" style="position:absolute;right:12px;top:1%;"><a href="javascript:void(0)">' + note + '</a></span>';
        }

        var boatcnd         = boat.boat_condition  || '';
        var boatLength      = boat.boat_length     || '';
        var stocknmbr       = boat.stock_number    || '';
        var boatPermalink   = boat.boatPermalink   || '';
        var boatDescription = boat.boatDescription || '';
        var engine_hours    = boat.engine_hours    || '';
        var hullId          = boat.hullId          || '';
        var priceLgoic      = boat.boatPrice ? '<div class="pymentBlock"><h4>$' + PaymentLogic(boat.boatPrice) + '/month</h4><p>240 months, 7.99% APR<br>20% Down Payment</p></div>' : '';
        var gridpriceLgoic  = boat.boatPrice ? '<li class="grid-price-item">$' + PaymentLogic(boat.boatPrice) + '/mo*</li>' : '';

        var carouselItems = '';
        if (Array.isArray(boat.boatImages)) {
            boat.boatImages.forEach(function(imgObj) {
                carouselItems += '<div class="item"><a href="' + link + '"><img src="' + imgObj.image + '" class="boat-img" alt="' + boatPermalink + '"></a>' + noteVal + '</div>';
            });
        } else {
            carouselItems = '<div class="item"><a href="' + link + '"><img src="' + boatimg + '" class="boat-img" alt="' + boatPermalink + '"></a>' + noteVal + '</div>';
        }

        result_html +=
            '<div class="boat-card list-view">'
            + '<div class="boat-img-box"><a href="' + link + '"><img src="' + boatimg + '" class="boat-img" alt="' + boatPermalink + '"></a>' + noteVal + '</div>'
            + '<div class="boat-content-box"><div class="upper-content-box">'
            + '<div class="sm-box-1"><h2 class="boat-title"><a href="' + link + '">' + boat.boatTitle + '</a></h2>'
            + '<div class="boat-condition-box"><ul class="boat-condition-list">'
            + (boatcnd     ? '<li><img src="https://cdn.mdsbrand.com/madis/assets/images/boat-details-icon/condition.png" alt=""> Condition: <span>' + boatcnd + '</span></li>' : '')
            + (boatLength  ? '<li><img src="https://cdn.mdsbrand.com/madis/assets/images/listing images/specs-list-img-1.png" alt="">Length: <span>' + boatLength + "\'" + '</span></li>' : '')
            + (stocknmbr   ? '<li><img src="https://cdn.mdsbrand.com/madis/assets/images/listing images/listing-icon-4.png" class="stock-img" alt="">Stock#: <span>' + stocknmbr + '</span></li>' : '')
            + (engine_hours ? '<li><img src="https://cdn.mdsbrand.com/madis/assets/images/listing images/specs-list-img-3.png" alt="">Hours: <span>' + engine_hours + ' hrs</span></li>' : '')
            + (hullId ? '<li><img src="https://cdn.mdsbrand.com/madis/assets/images/listing images/listing-icon-4.png" class="stock-img" alt="">Serial: <span>' + hullId + '</span></li>' : '')
            + '</ul></div></div>'
            + '<div class="sm-box-2"><div class="pricing-box"><div class="price-per-month">'
            + '<h3 class="card-text">' + price_html + '</h3>'
            + '<div><a href="' + link + '" class="listing-blue-btn">VIEW DETAILS</a></div>'
            + '</div></div></div></div>'
            + (boatDescription ? '<div class="bottom-content-box"><div class="desc-box"><h3>DESCRIPTION</h3><div class="listing-desc">' + boatDescription + ' <a href="' + link + '" class="read-more">MORE BOAT DETAILS</a></div></div></div>' : '')
            + '</div>'
            + '</div>'
            + '<div class="grid-boat-card grid-view">'
            + '<div class="grid-boat-img-box"><a href="' + link + '"><img src="' + boatimg + '" class="boat-img" alt="' + boatPermalink + '"></a>' + noteVal + '</div>'
            + '<div class="grid-boat-content-box"><div class="grid-upper-content-box"><div class="grid-sm-box-1">'
            + '<h2 class="grid-boat-title"><a href="' + link + '">' + boat.boatTitle + '</a></h2>'
            + '<div class="grid-boat-condition-box"><div class="grid-price-box">'
            + (grid_price_html ? '<ul><li class="grid-price-item">' + grid_price_html + '</li>' + gridpriceLgoic + '</ul>' : '<a href="' + link + '" class="grid-view-details-btn">View Details</a>')
            + '</div><ul class="grid-boat-condition-list">'
            + (boatcnd    ? '<li class="specs-list-item"><img src="https://cdn.mdsbrand.com/madis/assets/images/boat-details-icon/condition.png" alt=""> ' + boatcnd + '</li>' : '')
            + (boatLength ? '<li class="specs-list-item"><img src="https://cdn.mdsbrand.com/madis/assets/images/listing images/specs-list-img-1.png" alt=""> ' + boatLength + "\'" + '</li>' : '')
            + (engine_hours ? '<li class="specs-list-item"><img src="https://cdn.mdsbrand.com/madis/assets/images/listing images/specs-list-img-3.png" alt=""> ' + engine_hours + ' hrs</li>' : '')
            + (hullId ? '<li class="specs-list-item"><img src="https://cdn.mdsbrand.com/madis/assets/images/listing images/listing-icon-4.png" class="stock-img" alt="">' + hullId + '</li>' : '')
            + '</ul></div></div></div></div>'
            + '</div>';
    }

    return {
        current_page: currentPage,
        pageCount:    results.pageCount,
        result:       result_html,
    };
}

// ---------------------------------------------------------------------------
// Sitemap helper — exported for /sitemap.xml
// (copied exactly from reference repo)
// ---------------------------------------------------------------------------

async function generateInventoryFilterSitemapUrls(db, config) {
    const BASE_PATHS    = inventoryUrl.BASE_PATHS;
    const locationSlugs = inventoryUrl.getLocationSlugs();
    const urls          = [];

    const [categories, brands] = await Promise.all([
        db.boats.distinct('category'),
        db.boats.distinct('boat_brand'),
    ]);

    const filterGroups = [
        { prefix: 'type', values: categories.filter(Boolean) },
        { prefix: 'make', values: brands.filter(Boolean)     },
    ];

    for (const { prefix, values } of filterGroups) {
        for (const val of values) {
            const slug = inventoryUrl.slugify(val);
            if (!slug) continue;
            for (const bp of BASE_PATHS) {
                urls.push(`${config.baseUrl}/${bp}/${prefix}-${slug}/`);
                for (const loc of locationSlugs) {
                    urls.push(`${config.baseUrl}/${bp}-${loc}/${prefix}-${slug}/`);
                }
            }
        }
    }

    for (const bp of BASE_PATHS) {
        for (const loc of locationSlugs) {
            urls.push(`${config.baseUrl}/${bp}-${loc}/`);
        }
    }

    return urls;
}

module.exports = router;
module.exports.generateInventoryFilterSitemapUrls = generateInventoryFilterSitemapUrls;
