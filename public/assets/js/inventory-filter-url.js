/**
 * inventory-filter-url.js
 *
 * Client-side SEO URL builder for the boat inventory filter pages.
 * Loaded before custom.js so that updateBrowserUrl() is available when
 * getBoats() / getNewBoats() / getUsedBoats() call it after AJAX success.
 *
 * Responsibilities:
 *   - slugifyFilter()          — convert filter values to URL-safe slugs
 *   - buildInventoryFilterUrl() — assemble the full SEO URL from hidden input values
 *   - updateBrowserUrl()       — push the built URL to the browser history
 *   - updateFilterCounts()     — update badge counts on sidebar filter buttons
 *   - popstate listener        — reload page when user navigates back/forward
 *
 * Hidden inputs read by buildInventoryFilterUrl() (set by boats.hbs):
 *   #inventory_base_path  — e.g. "boats-for-sale"
 *   #inventory_location   — e.g. "sacramento" (empty string if none)
 *   #condition_val        — "New", "Used", or empty/0
 *   #category_val         — comma-separated category values (type filter)
 *   #brand_val            — comma-separated brand values (make filter)
 *   #model_val            — comma-separated model values
 *   #pricemax_val         — "min-max" string, e.g. "30000-70000"
 *   #year_val             — "min-max" string, e.g. "2022-2025"
 *   #length_val           — "min-max" string, e.g. "20-28"
 */

// ---------------------------------------------------------------------------
// slugifyFilter
// ---------------------------------------------------------------------------

/**
 * Convert a filter value to a URL-safe slug.
 * Mirrors the server-side slugify() in lib/inventory-url.js.
 *
 * @param {string} text - e.g. "Pontoon Boats"
 * @returns {string}    - e.g. "pontoon-boats"
 */
function slugifyFilter(text) {
    if (!text) return '';
    return text.toString().toLowerCase()
        .replace(/[&]/g, '-')
        .replace(/[\/\\]/g, '-')
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

// ---------------------------------------------------------------------------
// buildInventoryFilterUrl
// ---------------------------------------------------------------------------

/**
 * Assemble the SEO-friendly URL from the current state of the filter hidden inputs.
 *
 * Filter segments are emitted in prescribed order:
 *   type → make → model → price → year → length
 * Multi-value checkbox filters: first value goes in the path segment, additional
 * values are appended as query parameters (e.g. /make-barletta/?make=bennington).
 * These query-param pages receive noindex + canonical back to the first-value URL.
 *
 * @returns {string} - e.g. "/new-boats-for-sale-sacramento/type-pontoon/make-barletta/"
 */
function buildInventoryFilterUrl() {
    // ---- Determine base path ----
    // #inventory_base_path is the single source of truth. It is set by the server
    // on page load and updated by filterCheckboxSelected() when the condition changes.
    var basePath = ($('#inventory_base_path').val() || 'boats-for-sale').trim();

    // ---- Append location if present ----
    var location = $('#inventory_location').val() || '';
    var base     = basePath;
    if (location) base += '-' + location;

    var parts = [base];
    var queryParts = [];   // extra multi-select values → appended as ?key=val&key=val2

    // ---- Sort FILTER_DEFS by prescribed URL segment order ----
    // SIDEBAR_FILTERS (the source of FILTER_DEFS) controls sidebar panel rendering order,
    // which is independent of the URL segment order. We sort here so the URL always
    // emits segments as: type → make → model → price → year → length → hours,
    // regardless of how the sidebar panels are ordered.
    var URL_PREFIX_ORDER = ['type', 'make', 'model', 'series', 'price', 'year', 'length', 'hours'];
    var sortedDefs = (window.FILTER_DEFS || []).slice().sort(function(a, b) {
        var ai = a.urlPrefix ? URL_PREFIX_ORDER.indexOf(a.urlPrefix) : 999;
        var bi = b.urlPrefix ? URL_PREFIX_ORDER.indexOf(b.urlPrefix) : 999;
        return ai - bi;
    });

    // ---- Loop over sorted defs ----
    // Entries without urlPrefix (condition, series) have no URL segment — skip them.
    // Checkbox: first selected value → path segment; extra values → queryParts as ?key=val.
    // Range:    stored as "min-max"; length appends cfg.unit (e.g. 'ft') as suffix.
    sortedDefs.forEach(function(cfg) {
        if (!cfg.urlPrefix) return;
        var val = $('#' + cfg.hiddenId).val();
        if (!val || val === '0' || val === '0-0') return;

        if (cfg.type === 'checkbox') {
            var items = val.split(',').filter(Boolean);
            if (items.length > 0) {
                parts.push(cfg.urlPrefix + '-' + slugifyFilter(items[0]));
                for (var j = 1; j < items.length; j++) {
                    queryParts.push(cfg.urlPrefix + '=' + encodeURIComponent(slugifyFilter(items[j])));
                }
            }
        } else if (cfg.type === 'range') {
            var rp = val.split('-');
            if (rp.length === 2 && rp[0] && rp[1]) {
                var suffix = cfg.unit || '';
                parts.push(cfg.urlPrefix + '-' + rp[0] + '-' + rp[1] + suffix);
            }
        }
    });

    // ---- Search term always goes last ----
    var searchVal = $('#boat_name_val').val();
    if (searchVal && searchVal !== '0' && searchVal !== '') {
        parts.push('search-' + slugifyFilter(searchVal));
    }

    var url = '/' + parts.join('/') + '/';
    if (queryParts.length) url += '?' + queryParts.join('&');
    return url;
}

// ---------------------------------------------------------------------------
// updateBrowserUrl
// ---------------------------------------------------------------------------

/**
 * Build the current filter URL and push it to the browser history via
 * history.pushState — no page reload, URL bar reflects active filters.
 *
 * Called from getBoats() / getNewBoats() / getUsedBoats() after a successful
 * AJAX response updates the listing results.
 */
function updateBrowserUrl() {
    try {
        var newUrl = buildInventoryFilterUrl();
        var currentUrl = window.location.pathname + window.location.search;
        if (newUrl !== currentUrl) {
            window.history.pushState({ inventoryFilter: true }, '', newUrl);
        }
        updatePageHeading();
    } catch (e) {
        console.error('inventory-filter-url: error updating browser URL', e);
    }
}

// ---------------------------------------------------------------------------
// updatePageHeading
// ---------------------------------------------------------------------------

/**
 * Rebuild the h1.boatsHeading text to reflect the current active filters.
 * Mirrors the server-side buildPageMeta() logic in routes/inventory-filter.js:
 *   {Condition} Boats For Sale [in {Location}] [- {Brand1}, {Brand2}] [- {Category}]
 *
 * Called from updateBrowserUrl() after every AJAX filter change so the
 * heading stays in sync without a page reload.
 */
function updatePageHeading() {
    var $h1 = $('h1.boatsHeading');
    if (!$h1.length) return;

    // ---- Base title from condition ----
    var conditionVal = ($('#condition_val').val() || '').replace(/,+$/, '').toLowerCase();
    var base;
    if (conditionVal === 'new') {
        base = 'New Boats For Sale';
    } else if (conditionVal === 'used') {
        base = 'Used Boats For Sale';
    } else {
        base = 'Boats For Sale';
    }

    // ---- Location ----
    var location = ($('#inventory_location').val() || '').trim();
    if (location) {
        var locTitle = location.replace(/-/g, ' ')
            .replace(/\b\w/g, function (c) { return c.toUpperCase(); });
        base += ' in ' + locTitle;
    }

    // ---- Helper: convert comma-separated slug/value string to display names ----
    function unslugifyList(val) {
        if (!val || val === '0') return [];
        return val.split(',')
            .map(function (v) { return v.trim(); })
            .filter(Boolean)
            .map(function (v) {
                return v.replace(/-/g, ' ')
                    .replace(/\b\w/g, function (c) { return c.toUpperCase(); });
            });
    }

    // ---- Brand ----
    var brands = unslugifyList($('#brand_val').val());
    if (brands.length) {
        base += ' - ' + brands.join(', ');
    }

    // ---- Category (type) ----
    var categories = unslugifyList($('#category_val').val());
    if (categories.length) {
        base += ' - ' + categories.join(', ');
    }

    $h1.text(base);
}

// ---------------------------------------------------------------------------
// popstate — browser back / forward navigation
// ---------------------------------------------------------------------------

/**
 * When the user navigates Back or Forward through filter URLs (pushed by
 * updateBrowserUrl), reload the page so the server renders the correct
 * filtered results for the restored URL.
 */
window.addEventListener('popstate', function(event) {
    if (event.state && event.state.inventoryFilter) {
        window.location.reload();
    }
});

// ---------------------------------------------------------------------------
// updateFilterCounts
// ---------------------------------------------------------------------------

/**
 * Refresh the numeric badge on each sidebar filter button to show how many
 * values are currently selected for that filter.
 *
 * Reads every .boat_filter hidden input, counts comma-separated values,
 * then updates the <span> inside the matching sidebar button.
 *
 * Called on page load (via $(updateFilterCounts)) and after any filter change.
 */
function updateFilterCounts() {
    $('.boat_filter').each(function() {
        var filterKey = $(this).attr('id').replace('_val', '');
        var rawVal    = ($(this).val() || '').trim();
        var count     = 0;

        if (rawVal && rawVal !== '0' && rawVal.toLowerCase() !== 'undefined') {
            count = rawVal.includes(',')
                ? rawVal.split(',').filter(function(v) { return v.trim() !== ''; }).length
                : 1;
        }

        var $btn  = $('.inner_wrap_bt a[title="' + filterKey + '"]');
        var $span = $btn.find('span');

        if (count > 0) {
            $span.text(count).css('display', 'inline-flex');
            $btn.addClass('has-selected');
        } else {
            $span.text('').hide();
            $btn.removeClass('has-selected');
        }
    });
}

// Run on page load to initialise badge counts from pre-filled session values
$(updateFilterCounts);
