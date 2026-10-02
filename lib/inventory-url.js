'use strict';

/**
 * Inventory URL utility module
 * Handles SEO-friendly URL parsing and building for boat inventory filter pages.
 *
 * URL format:
 *   /<basePath>[-<location>]/[type-<val>/][make-<val>/][model-<val>/]
 *   [price-<min>-<max>/][year-<min>-<max>/][length-<min>-<max>ft/][hours-<min>-<max>/][page-<n>/]
 *
 * Multi-value filters: first value in path segment, extras as query params.
 *   e.g. /make-barletta/?make=bennington  → noindex, canonical → /make-barletta/
 * Query-param multi-select pages carry noindex and canonical back to the single-value URL.
 */

const BASE_PATHS = ['boats-for-sale', 'new-boats-for-sale', 'used-boats-for-sale'];

const CONDITION_MAP = {
    'boats-for-sale':     null,    // all conditions
    'new-boats-for-sale': 'New',
    'used-boats-for-sale': 'Used',
};

const FILTER_ORDER = ['type', 'make', 'model', 'class', 'price', 'year', 'length', 'hours'];

/**
 * Master filter configuration.
 *
 * To disable a filter across the entire system (URL parsing, MongoDB queries,
 * URL building, sitemap generation, and sidebar rendering), set enabled: false.
 * No other code changes are needed.
 *
 * Properties:
 *   enabled {boolean} - whether this filter is active
 *   label   {string}  - human-readable name for sidebar headings / page titles
 *   field   {string}  - MongoDB document field this filter maps to
 */
const FILTER_CONFIG = {
    type:   { enabled: true,  label: 'Category', field: 'category'     },
    make:   { enabled: true,  label: 'Brand',    field: 'boat_brand'   },
    model:  { enabled: true,  label: 'Model',    field: 'boat_model'   },
    price:  { enabled: true,  label: 'Price',    field: 'boatPrice'    },
    year:   { enabled: true,  label: 'Year',     field: 'boat_year'    },
    length: { enabled: true,  label: 'Length',   field: 'boat_length'  },
    hours:  { enabled: true,  label: 'Hours',    field: 'engine_hours' },
    search:  { enabled: true,  label: 'Search',   field: 'boat_name_val' },
    series:  { enabled: true,  label: 'Series',   field: 'boat_series'   },
    class:   { enabled: true,  label: 'Class',    field: 'boat_class'    },
};

// Dynamic location slugs — populated from company_profile.company_locations on app startup
let locationSlugs = [];

function setLocationSlugs(slugs) {
    locationSlugs = slugs;
}

function getLocationSlugs() {
    return locationSlugs;
}

/**
 * Convert text to a URL-safe slug.
 * e.g. "Pontoon Boats" → "pontoon-boats", "Sea Ray" → "sea-ray"
 *
 * @param {string} text
 * @returns {string}
 */
function slugify(text) {
    if (!text) return '';
    return text
        .toString()
        .toLowerCase()
        .replace(/[&]/g, '-')
        .replace(/[\/\\]/g, '-')
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

/**
 * Reverse a slug back to a human-readable value (hyphens → spaces).
 * Used for database lookups where the stored value has spaces.
 * e.g. "pontoon-boats" → "pontoon boats"
 *
 * @param {string} slug
 * @returns {string}
 */
function unslugify(slug) {
    if (!slug) return '';
    return slug.replace(/-/g, ' ');
}

/**
 * Parse a filter URL path into its components.
 * Disabled filters (FILTER_CONFIG[key].enabled === false) are silently skipped.
 *
 * @param {string} urlPath - e.g. "/new-boats-for-sale-sacramento/type-pontoon/make-barletta/price-30000-50000/"
 * @returns {{ basePath: string|null, condition: string|null, location: string|null, filters: object, page: number|null }}
 */
function parseFilterUrl(urlPath) {
    // Remove leading/trailing slashes and split into segments
    const cleanPath = urlPath.replace(/^\/+|\/+$/g, '');
    const segments = cleanPath.split('/').filter(Boolean);

    if (segments.length === 0) {
        return { basePath: null, condition: null, location: null, filters: {}, page: null };
    }

    // --- Parse first segment: basePath + optional location ---
    const firstSegment = segments[0];
    let basePath = null;
    let location = null;

    // Sort longest-first to prevent 'boats-for-sale' from matching before 'new-boats-for-sale'
    const sortedBases = [...BASE_PATHS].sort((a, b) => b.length - a.length);
    for (const bp of sortedBases) {
        if (firstSegment === bp) {
            basePath = bp;
            break;
        }
        if (firstSegment.startsWith(bp + '-')) {
            const locationCandidate = firstSegment.slice(bp.length + 1);
            // Accept if in the configured list, or if the list hasn't loaded yet, or if it's a valid slug shape
            if (locationCandidate && (
                locationSlugs.length === 0 ||
                locationSlugs.includes(locationCandidate) ||
                /^[a-z0-9-]+$/.test(locationCandidate)
            )) {
                basePath = bp;
                location = locationCandidate;
                break;
            }
        }
    }

    // Not a valid filter URL
    if (!basePath) {
        return { basePath: null, condition: null, location: null, filters: {}, page: null };
    }

    const condition = CONDITION_MAP[basePath];

    // --- Parse remaining segments as filter values ---
    const filters = {};
    let page = null;

    for (let i = 1; i < segments.length; i++) {
        const seg = segments[i];

        if (seg.startsWith('type-') && FILTER_CONFIG.type.enabled) {
            filters.type = seg.slice(5);   // always single value from path

        } else if (seg.startsWith('make-') && FILTER_CONFIG.make.enabled) {
            filters.make = seg.slice(5);   // always single value from path

        } else if (seg.startsWith('model-') && FILTER_CONFIG.model.enabled) {
            filters.model = seg.slice(6);  // always single value from path

        } else if (seg.startsWith('series-') && FILTER_CONFIG.series.enabled) {
            filters.series = seg.slice(7); // always single value from path

        } else if (seg.startsWith('price-') && FILTER_CONFIG.price.enabled) {
            const parts = seg.slice(6).split('-');
            if (parts.length === 2) {
                filters.price = { min: parseInt(parts[0], 10), max: parseInt(parts[1], 10) };
            }

        } else if (seg.startsWith('year-') && FILTER_CONFIG.year.enabled) {
            const parts = seg.slice(5).split('-');
            if (parts.length === 2) {
                filters.year = { min: parseInt(parts[0], 10), max: parseInt(parts[1], 10) };
            }

        } else if (seg.startsWith('length-') && FILTER_CONFIG.length.enabled) {
            // e.g. "length-20-25ft" — strip the ft suffix before splitting
            const raw = seg.slice(7).replace(/ft$/i, '');
            const parts = raw.split('-');
            if (parts.length === 2) {
                filters.length = { min: parseInt(parts[0], 10), max: parseInt(parts[1], 10) };
            }

        } else if (seg.startsWith('hours-') && FILTER_CONFIG.hours.enabled) {
            const parts = seg.slice(6).split('-');
            if (parts.length === 2) {
                filters.hours = { min: parseInt(parts[0], 10), max: parseInt(parts[1], 10) };
            }

        } else if (seg.startsWith('class-') && FILTER_CONFIG.class.enabled) {
            filters.class = seg.slice(6);

        } else if (seg.startsWith('search-') && FILTER_CONFIG.search.enabled) {
            // e.g. "search-pontoon-boat" → "pontoon boat"
            filters.search = seg.slice(7).replace(/-/g, ' ');

        } else if (seg.startsWith('page-')) {
            page = parseInt(seg.slice(5), 10) || 1;
        }
    }

    return { basePath, condition, location, filters, page };
}

/**
 * Build a canonical filter URL path from components.
 * Segments are always emitted in FILTER_ORDER. Disabled or empty filters are skipped.
 * Page number is excluded from canonical URLs by default.
 *
 * @param {string}      basePath    - e.g. "new-boats-for-sale"
 * @param {string|null} location    - e.g. "sacramento"
 * @param {object}      filters     - { type, make, model, price:{min,max}, year:{min,max}, length:{min,max}, hours:{min,max} }
 * @param {number|null} page        - page number (only included if includePage is true)
 * @param {boolean}     includePage - set true only for non-canonical pagination links
 * @returns {string} - e.g. "/new-boats-for-sale-sacramento/type-pontoon/make-barletta/"
 */
function buildFilterUrl(basePath, location, filters, page, includePage) {
    const parts = [];

    // Base path with optional location suffix
    let base = basePath;
    if (location) {
        base += '-' + location;
    }
    parts.push(base);

    // Emit each filter in prescribed order; skip disabled filters and empty values.
    // Only the first (canonical) value goes into the path — multi-select extras are query params.
    if (FILTER_CONFIG.type.enabled && filters.type) {
        var typeFirst = Array.isArray(filters.type) ? filters.type[0] : filters.type;
        parts.push('type-' + slugify(typeFirst));
    }
    if (FILTER_CONFIG.make.enabled && filters.make) {
        var makeFirst = Array.isArray(filters.make) ? filters.make[0] : filters.make;
        parts.push('make-' + slugify(makeFirst));
    }
    if (FILTER_CONFIG.model.enabled && filters.model) {
        var modelFirst = Array.isArray(filters.model) ? filters.model[0] : filters.model;
        parts.push('model-' + slugify(modelFirst));
    }
    if (FILTER_CONFIG.series.enabled && filters.series) {
        var seriesFirst = Array.isArray(filters.series) ? filters.series[0] : filters.series;
        parts.push('series-' + slugify(seriesFirst));
    }
    if (FILTER_CONFIG.class.enabled && filters.class) {
        var classFirst = Array.isArray(filters.class) ? filters.class[0] : filters.class;
        parts.push('class-' + slugify(classFirst));
    }
    if (FILTER_CONFIG.price.enabled && filters.price && filters.price.min != null && filters.price.max != null) {
        parts.push('price-' + filters.price.min + '-' + filters.price.max);
    }
    if (FILTER_CONFIG.year.enabled && filters.year && filters.year.min != null && filters.year.max != null) {
        parts.push('year-' + filters.year.min + '-' + filters.year.max);
    }
    if (FILTER_CONFIG.length.enabled && filters.length && filters.length.min != null && filters.length.max != null) {
        parts.push('length-' + filters.length.min + '-' + filters.length.max + 'ft');
    }
    if (FILTER_CONFIG.hours.enabled && filters.hours && filters.hours.min != null && filters.hours.max != null) {
        parts.push('hours-' + filters.hours.min + '-' + filters.hours.max);
    }
    if (FILTER_CONFIG.search.enabled && filters.search) {
        var searchFirst = Array.isArray(filters.search) ? filters.search[0] : filters.search;
        parts.push('search-' + slugify(searchFirst));
    }

    // Page — only included for non-canonical pagination links, never for <link rel="canonical">
    if (includePage && page && page > 1) {
        parts.push('page-' + page);
    }

    return '/' + parts.join('/') + '/';
}

/**
 * Convert parsed URL filters into a MongoDB query object.
 * Disabled filters (FILTER_CONFIG[key].enabled === false) are silently skipped.
 *
 * @param {object}      parsedFilters - The filters object from parseFilterUrl()
 * @param {string|null} condition     - 'New', 'Used', or null (all)
 * @param {object}      queryParams   - req.query — extra multi-select values arrive as ?make=val
 * @returns {object} MongoDB filter object
 */
function buildMongoFilter(parsedFilters, condition, queryParams) {
    const filter = {};

    // Condition filter (New / Used / all)
    if (condition) {
        filter.boat_condition = condition;
    }

    // Location is an SEO URL segment only — it represents the dealer's service area.
    // Boats are NOT stored by dealer city, so no DB filter is applied for location.

    // Helper: merge a single path value with any extra values from query params.
    // e.g. path = 'barletta', queryParams.make = 'bennington'
    //   → ['barletta', 'bennington']
    function mergeWithQuery(pathVal, queryKey) {
        var extras = queryParams && queryParams[queryKey];
        var base = pathVal ? [pathVal] : [];
        if (!extras) return base;
        var extraArr = Array.isArray(extras) ? extras : [extras];
        return base.concat(extraArr.filter(Boolean));
    }

    // type → category field
    // Uses partial regex so "pontoon" matches "Pontoon Boats", "Pontoon", etc.
    // Hyphens in the URL slug are treated as matching space, hyphen, or '/' in the DB value
    // so that "ski-wakeboard-boat" correctly matches "Ski/Wakeboard Boat".
    var typeVals = mergeWithQuery(parsedFilters.type, 'type');
    if (FILTER_CONFIG.type.enabled && typeVals.length) {
        // Replace each hyphen with a character class that matches any word separator
        function slugToRegex(s) { return s.replace(/-/g, '[-\\s/]'); }
        if (typeVals.length === 1) {
            filter.category = { $regex: new RegExp(slugToRegex(typeVals[0]), 'i') };
        } else {
            filter.category = { $in: typeVals.map(function(v) { return new RegExp(slugToRegex(v), 'i'); }) };
        }
    }

    // make → boat_brand field (exact match, case-insensitive)
    var makeVals = mergeWithQuery(parsedFilters.make, 'make');
    if (FILTER_CONFIG.make.enabled && makeVals.length) {
        if (makeVals.length === 1) {
            filter.boat_brand = { $regex: new RegExp('^' + unslugify(makeVals[0]) + '$', 'i') };
        } else {
            filter.boat_brand = { $in: makeVals.map(function(v) { return new RegExp('^' + unslugify(v) + '$', 'i'); }) };
        }
    }

    // model → boat_model field (partial match for e.g. "Aria 20L")
    var modelVals = mergeWithQuery(parsedFilters.model, 'model');
    if (FILTER_CONFIG.model.enabled && modelVals.length) {
        if (modelVals.length === 1) {
            filter.boat_model = { $regex: new RegExp(unslugify(modelVals[0]), 'i') };
        } else {
            filter.boat_model = { $in: modelVals.map(function(v) { return new RegExp(unslugify(v), 'i'); }) };
        }
    }

    // series → boat_series field (partial match)
    var seriesVals = mergeWithQuery(parsedFilters.series, 'series');
    if (FILTER_CONFIG.series.enabled && seriesVals.length) {
        if (seriesVals.length === 1) {
            filter.boat_series = { $regex: new RegExp(unslugify(seriesVals[0]), 'i') };
        } else {
            filter.boat_series = { $in: seriesVals.map(function(v) { return new RegExp(unslugify(v), 'i'); }) };
        }
    }

    // class → boat_class field (partial match)
    var classVals = mergeWithQuery(parsedFilters.class, 'class');
    if (FILTER_CONFIG.class.enabled && classVals.length) {
        if (classVals.length === 1) {
            filter.boat_class = { $regex: new RegExp(unslugify(classVals[0]), 'i') };
        } else {
            filter.boat_class = { $in: classVals.map(function(v) { return new RegExp(unslugify(v), 'i'); }) };
        }
    }

    // price → boatPrice range
    if (FILTER_CONFIG.price.enabled && parsedFilters.price) {
        if (parsedFilters.price.min !== 0 || parsedFilters.price.max !== 0) {
            filter.boatPrice = {};
            if (parsedFilters.price.min != null) filter.boatPrice.$gte = parsedFilters.price.min;
            if (parsedFilters.price.max != null) filter.boatPrice.$lte = parsedFilters.price.max;
        }
    }

    // year → boat_year range
    if (FILTER_CONFIG.year.enabled && parsedFilters.year) {
        if (parsedFilters.year.min !== 0 || parsedFilters.year.max !== 0) {
            filter.boat_year = {};
            if (parsedFilters.year.min != null) filter.boat_year.$gte = parsedFilters.year.min;
            if (parsedFilters.year.max != null) filter.boat_year.$lte = parsedFilters.year.max;
        }
    }

    // length → boat_length range
    if (FILTER_CONFIG.length.enabled && parsedFilters.length) {
        if (parsedFilters.length.min !== 0 || parsedFilters.length.max !== 0) {
            filter.boat_length = {};
            if (parsedFilters.length.min != null) filter.boat_length.$gte = parsedFilters.length.min;
            if (parsedFilters.length.max != null) filter.boat_length.$lte = parsedFilters.length.max;
        }
    }

    // hours → engine_hours range (typically used-boat listings only)
    if (FILTER_CONFIG.hours.enabled && parsedFilters.hours) {
        filter.engine_hours = {};
        if (parsedFilters.hours.min != null) filter.engine_hours.$gte = parsedFilters.hours.min;
        if (parsedFilters.hours.max != null) filter.engine_hours.$lte = parsedFilters.hours.max;
    }

    // search → search query on multiple fields
    var searchVals = mergeWithQuery(parsedFilters.search, 'search');
    if (FILTER_CONFIG.search.enabled && searchVals.length) {
        var searchKeyword = searchVals[0].trim();
        var regexQuery = { $regex: new RegExp(searchKeyword, 'i') }; 

        var orConditions = [
            { boatTitle: regexQuery },
            { stock_number: regexQuery },
            { boat_brand: regexQuery },
            { boat_make: regexQuery },
            { boat_model: regexQuery }
        ];

        var yearNum = parseFloat(searchKeyword);
        if (!isNaN(yearNum)) {
            orConditions.push({ boat_year: yearNum });
        }

        filter.$or = orConditions;
    }

    return filter;
}

/**
 * Determine whether a page should carry a noindex meta tag.
 *
 * Pages with multiple values for a single filter produce URL permutations that
 * search engines should not index (they're not canonical representations).
 * This includes both + separated path values and legacy query-param multi-selects.
 *
 * @param {object} queryParams   - req.query
 * @param {object} parsedFilters - filters object from parseFilterUrl()
 * @returns {boolean}
 */
function shouldNoindex(queryParams, parsedFilters) {
    // Multi-select overflow arrives as query params: ?make=val2&make=val3
    // Any of these present means this is a non-canonical permutation — noindex it.
    if (queryParams) {
        var multiSelectKeys = ['type', 'make', 'model', 'series', 'class'];
        if (multiSelectKeys.some(function(key) { return queryParams[key] != null; })) return true;
    }
    // Defensive: legacy + separated path values also trigger noindex
    if (parsedFilters) {
        if (Array.isArray(parsedFilters.type) || Array.isArray(parsedFilters.make) || Array.isArray(parsedFilters.model)) return true;
    }
    return false;
}

/**
 * Build the full canonical URL (protocol + host + path) for a filtered page.
 * Excludes pagination and sort parameters — those are never part of the canonical.
 *
 * @param {object}      req      - Express request object
 * @param {string}      basePath - e.g. "new-boats-for-sale"
 * @param {string|null} location - e.g. "sacramento"
 * @param {object}      filters  - parsed filters object
 * @returns {string} - e.g. "https://example.com/new-boats-for-sale-sacramento/type-pontoon/"
 */
function buildCanonicalUrl(req, basePath, location, filters) {
    const protocol = req.protocol;
    const host = req.get('host');
    const path = buildFilterUrl(basePath, location, filters);
    return protocol + '://' + host + path;
}

/**
 * Sidebar filter panel configuration.
 *
 * Each entry defines one collapsible filter panel in the inventory sidebar.
 * To remove a panel, delete its entry — the sidebar section and its hidden
 * input are both rendered generically from this array, so no template or JS
 * changes are needed.
 *
 * Checkbox panel properties:
 *   key          {string}  - filter identifier; used as hidden-input prefix and CSS id prefix
 *   label        {string}  - heading shown in the sidebar
 *   type         {string}  - 'checkbox'
 *   hiddenId     {string}  - id (and name) of the hidden <input> that stores selected values
 *   checkboxName {string}  - name attribute on the checkboxes (e.g. 'Brand[]')
 *   dataKey      {string}  - key in the route's template data holding the items array
 *   hasAll       {boolean} - whether to include an "All" option at the top (condition filter only)
 *   skipEmpty    {boolean} - skip items where _id is null or empty string
 *
 * Range panel properties:
 *   key          {string}  - filter identifier
 *   label        {string}  - heading shown in the sidebar
 *   type         {string}  - 'range'
 *   hiddenId     {string}  - id of the hidden <input> that stores the min-max value
 *   rangeId      {string}  - id of the desktop jQuery UI slider div
 *   displayId    {string}  - id of the desktop text display input (also holds data-min/max attrs)
 *   mobRangeId   {string}  - id of the mobile slider div
 *   mobDisplayId {string}  - id of the mobile text display input
 *   minValId     {string}  - id of desktop min label span
 *   maxValId     {string}  - id of desktop max label span
 *   mobMinId     {string}  - id of mobile min label span
 *   mobMaxId     {string}  - id of mobile max label span
 *   minDataAttr  {string}  - HTML data attribute name for the min value (e.g. 'minlength')
 *   maxDataAttr  {string}  - HTML data attribute name for the max value (e.g. 'maxlength')
 *   minKey       {string}  - key in route data for the minimum value
 *   maxKey       {string}  - key in route data for the maximum value
 *   unit         {string}  - optional display unit appended to slider values (e.g. 'ft')
 *   isCurrency   {boolean} - format with $ prefix
 *   step         {number}  - slider step (defaults to 1)
 */
const SIDEBAR_FILTERS = [
    {
        key: 'condition', label: 'Condition', type: 'checkbox',
        hiddenId: 'condition_val', checkboxName: 'condition[]',
        dataKey: 'boat_condition', hasAll: true,
    },
    {
        key: 'brand', label: 'Brand', type: 'checkbox', urlPrefix: 'make',
        hiddenId: 'brand_val', checkboxName: 'Brand[]',
        dataKey: 'boat_brand',
    },
    // {
    //     key: 'category', label: 'Category', type: 'checkbox', urlPrefix: 'type',
    //     hiddenId: 'category_val', checkboxName: 'Category[]',
    //     dataKey: 'boat_category',
    // },
    {
        key: 'model', label: 'Model', type: 'checkbox', urlPrefix: 'model',
        hiddenId: 'model_val', checkboxName: 'Boat-model[]',
        dataKey: 'boat_model', skipEmpty: true,
    },
    {
        key: 'class', label: 'Class', type: 'checkbox', urlPrefix: 'class',
        hiddenId: 'class_val', checkboxName: 'Class[]',
        dataKey: 'boat_class', skipEmpty: true,
    },
    // {
    //     key: 'series', label: 'Series', type: 'checkbox', urlPrefix: 'series',
    //     hiddenId: 'series_val', checkboxName: 'Boat-series[]',
    //     dataKey: 'boat_series', skipEmpty: true,
    // },
    {
        key: 'length', label: 'Length', type: 'range', urlPrefix: 'length',
        hiddenId: 'length_val',
        rangeId: 'length-range', displayId: 'amount-length',
        mobRangeId: 'length-range-mob', mobDisplayId: 'amount-length-mob',
        minValId: 'length-min-value', maxValId: 'length-max-value',
        mobMinId: 'mob-length-min-value', mobMaxId: 'mob-length-max-value',
        minDataAttr: 'minlength', maxDataAttr: 'maxlength',
        minKey: 'minLength', maxKey: 'maxLength', unit: 'ft',
    },
    {
        key: 'year', label: 'Year', type: 'range', urlPrefix: 'year',
        hiddenId: 'year_val',
        rangeId: 'year-range', displayId: 'amount-year',
        mobRangeId: 'year-range-mob', mobDisplayId: 'amount-year-mob',
        minValId: 'year-min-value', maxValId: 'year-max-value',
        mobMinId: 'mob-year-min-value', mobMaxId: 'mob-year-max-value',
        minDataAttr: 'minyear', maxDataAttr: 'maxyear',
        minKey: 'minYear', maxKey: 'maxYear',
    },
    {
        key: 'price', label: 'Price', type: 'range', urlPrefix: 'price',
        hiddenId: 'pricemax_val',
        rangeId: 'price-range', displayId: 'amount',
        mobRangeId: 'price-range-mob', mobDisplayId: 'amount-mob',
        minValId: 'price-min-value', maxValId: 'price-max-value',
        mobMinId: 'mob-price-min-value', mobMaxId: 'mob-price-max-value',
        minDataAttr: 'minprice', maxDataAttr: 'maxprice',
        minKey: 'minPrice', maxKey: 'maxPrice', isCurrency: true, step: 50,
    },
];

/**
 * Build the resolved filterPanels array for template rendering.
 *
 * For checkbox panels, each item is annotated with a `checked` boolean so
 * Handlebars can use {{#if this.checked}} without helpers.
 *
 * For range panels, minValue / maxValue are resolved from the data object so
 * the template can emit data-min/max attributes without any logic.
 *
 * @param {object} data    - template data object (boat_brand, boat_model, minPrice, etc.)
 * @param {object} session - req.session (for pre-checking restored filter values)
 * @returns {Array} resolved panel objects ready for {{#each filterPanels}}
 */
function buildFilterPanels(data, session) {
    return SIDEBAR_FILTERS.map(function(cfg) {
        var panel = Object.assign({}, cfg);   // shallow copy — keeps config object clean

        if (cfg.type === 'checkbox') {
            var items = (data[cfg.dataKey] || [])
                .filter(function(v) {
                    return !cfg.skipEmpty || (v._id !== null && v._id !== '' && v._id !== undefined);
                })
                .map(function(v) {
                    var sessionVal = (session[cfg.hiddenId] || '').toString();
                    // Two-way comparison:
                    //   1. Direct case-insensitive: handles session values that store the DB value
                    //      ('Barletta' stored when user ticks a checkbox).
                    //   2. Slug comparison: handles session values that store URL slugs from SEO
                    //      routes ('ski-wakeboard-boat' for DB value 'Ski/Wakeboard Boat').
                    //      slugify() converts both sides to the same normalised form.
                    var idLower    = String(v._id).toLowerCase();
                    var idSlug     = slugify(String(v._id));
                    var checked = sessionVal !== '0' && sessionVal !== '' &&
                                  sessionVal.split(',').some(function(sv) {
                                      return sv.toLowerCase() === idLower ||
                                             slugify(sv) === idSlug;
                                  });
                    return { _id: v._id, count: v.count, checked: checked };
                });
            panel.items = items;
            if (cfg.hasAll) {
                var allSessionVal = (session[cfg.hiddenId] || '').toString();
                panel.allChecked = (allSessionVal === '0' || allSessionVal === '');
            }
        }

        if (cfg.type === 'range') {
            panel.minValue = (data[cfg.minKey] !== undefined && data[cfg.minKey] !== null) ? data[cfg.minKey] : 0;
            panel.maxValue = (data[cfg.maxKey] !== undefined && data[cfg.maxKey] !== null) ? data[cfg.maxKey] : 0;
        }

        return panel;
    });
}

module.exports = {
    BASE_PATHS,
    CONDITION_MAP,
    FILTER_ORDER,
    FILTER_CONFIG,
    SIDEBAR_FILTERS,
    buildFilterPanels,
    parseFilterUrl,
    buildFilterUrl,
    buildMongoFilter,
    buildCanonicalUrl,
    shouldNoindex,
    slugify,
    unslugify,
    setLocationSlugs,
    getLocationSlugs,
};
