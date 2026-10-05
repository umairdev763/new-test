/**
 * inventory-filter-controls.js
 *
 * Generic inventory filter handlers and slider initialisation for all
 * boat listing pages (boats-for-sale, new-boats-for-sale, used-boats-for-sale).
 *
 * Replaces the per-filter functions that were in custom.js:
 *   brandSelected, categorySelected, classSelected, modelSelected, seriesSelected
 *   conditionSelected, newboat_conditionSelected, usedboat_conditionSelected
 *   newboat_brandSelected, newboat_categorySelected, newboat_modelSelected, newboat_seriesSelected
 *   usedboat_brandSelected, usedboat_categorySelected, usedboat_modelSelected, usedboat_seriesSelected
 *   update_boat_filter, update_new_boat_filter, update_used_boat_filter
 *   remove_filter, remove_newboat_filter, remove_usedboat_filter
 *   jQuery UI range slider initialisation (length, year, price — desktop + mobile)
 *
 * Depends on: jQuery, jQuery UI (sliders), getBoats() from inventory-results.js
 *
 * Load order:  inventory-filter-url.js → inventory-filter-controls.js → inventory-results.js → custom.js
 */

/* -------------------------------------------------------------------------- *
 * Page context detection
 * -------------------------------------------------------------------------- */

/**
 * Determine which boat listing page we are on by reading the
 * hidden #paginateUrl input written by the server.
 *
 * @returns {'new'|'used'|'all'}
 */
function getPageContext() {
    var slug = $('#paginateUrl').val() || '';
    if (/new-boats/.test(slug)) return 'new';
    if (/used-boats/.test(slug)) return 'used';
    return 'all';
}

/**
 * Refresh inventory results for the current page.
 * getBoats() detects page context internally (all / new / used).
 */
function refreshInventory() {
    getBoats();
}

/**
 * On page load: clear all filters if total_units is 0 (invalid session state),
 * then always fire refreshInventory() so filter option counts are populated
 * from the AJAX aggregation response — the server-rendered HTML omits them.
 */
function checkZeroResult() {
    if ($('input[name=total_units]').val() == 0) {
        $('.boat_filter').each(function () {
            $(this).val('');
        });
    }
    refreshInventory();
}
$(function () {
    // Defer until all scripts are loaded so getBoats() is defined.
    if ($('input[name="listing_page_slug"]').length > 0) {
        checkZeroResult();
    }
});

/* -------------------------------------------------------------------------- *
 * Generic checkbox handler
 * -------------------------------------------------------------------------- */

/**
 * Single handler for every filter checkbox on the inventory sidebar.
 * Replaces brandSelected, categorySelected, modelSelected, seriesSelected,
 * conditionSelected and all their newboat_* / usedboat_* variants.
 *
 * Usage in template:  onchange="filterCheckboxSelected('brand', this)"
 *
 * @param {string}          filterKey - e.g. 'condition', 'brand', 'category', 'model', 'series'
 * @param {HTMLInputElement} element   - the checkbox that triggered the change
 */
function filterCheckboxSelected(filterKey, element) {
    var checkboxes = document.getElementsByName(element.name);
    var chked_vals = '';
    var arr = [];
    var filtered_chkd_array = [];

    // --- Condition filter: mutually exclusive (radio-button behavior) ---
    // Selecting All/New/Used is always a page-level change; navigate to new URL
    // so the server renders the right condition-scoped route.
    if (filterKey === 'condition') {
        // Uncheck every other condition checkbox
        for (var ci = 0, cn = checkboxes.length; ci < cn; ci++) {
            if (checkboxes[ci] !== element) checkboxes[ci].checked = false;
        }
        var newBase = 'boats-for-sale';
        if (!element.checked || element.value === 'all') {
            // Unchecked or "All" selected → show all boats
            $('#condition_val').val(0);
        } else {
            // "New" or "Used" selected
            $('#condition_val').val(element.value);
            var cv = element.value.toLowerCase();
            if (cv === 'new')  newBase = 'new-boats-for-sale';
            else if (cv === 'used') newBase = 'used-boats-for-sale';
        }
        // Update base path so buildInventoryFilterUrl() uses the new condition
        $('#inventory_base_path').val(newBase);
        window.location.href = buildInventoryFilterUrl();
        return;
    }

    // Collect all currently-checked values (exclude "all" sentinel)
    for (var i = 0, n = checkboxes.length; i < n; i++) {
        if (checkboxes[i].checked && checkboxes[i].value !== 'all') {
            // brand / category / engine_make have values with possible spaces; join as-is
            if (filterKey === 'brand' || filterKey === 'category' || filterKey === 'engine_make') {
                if (!checkboxes[checkboxes[i].value]) {
                    chked_vals += checkboxes[i].value + ',';
                }
            } else {
                chked_vals += checkboxes[i].value + ',';
            }
        }
    }

    if (element.checked) {
        arr.push(chked_vals);
        var removeDup = [].concat.apply([], [arr[0].split(',')]);
        removeDup = [...new Set(removeDup)].join(',');

        // model / series values may contain apostrophes — replace to avoid JS string issues
        if (filterKey === 'model' || filterKey === 'series') {
            removeDup = removeDup.replace(/'/g, ':');
        }

        filtered_chkd_array.push(removeDup);
        updateInventoryFilter(filterKey, filtered_chkd_array);
        localStorage.checked = true;
    } else {
        localStorage.checked = false;

        // brand / category / engine_make: the li id uses the raw value (with spaces) so checkbyid=1
        var checkbyid = (filterKey === 'brand' || filterKey === 'category' || filterKey === 'engine_make') ? 1 : 0;

        removeInventoryFilter(filterKey + '_' + element.value + '_filter', checkbyid);
    }
}

/* -------------------------------------------------------------------------- *
 * Unified update + remove
 * -------------------------------------------------------------------------- */

/**
 * Update a filter's hidden input and "You searched for" tag list, then
 * refresh the inventory results.
 *
 * Replaces update_boat_filter, update_new_boat_filter, update_used_boat_filter.
 * List items embed removeInventoryFilter() in their onclick so the unified
 * remove handler is used regardless of page type.
 *
 * @param {string} key                - filter key, e.g. 'brand', 'year', 'pricemax', 'horse_power'
 * @param {Array}  filtered_chkd_array - array of value strings (may contain comma-separated values)
 */
function updateInventoryFilter(key, filtered_chkd_array) {
    var selecteditem;
    var t = '';

    // Write to hidden input
    $('#' + key + '_val').val(filtered_chkd_array);

    // Remove existing tags for this filter
    $('.' + key + '_selected_filters').remove();

    if (key === 'year' || key === 'pricemax' || key === 'length' || key === 'horse_power') {
        // Range filters — single tag with the range value
        var label = key === 'pricemax' ? 'Price Max' : (key === 'horse_power' ? 'Horse Power' : (key.charAt(0).toUpperCase() + key.slice(1)));
        t += '<li class="' + key + '_selected_filters" id="' + key + '_' + filtered_chkd_array + '_filter">' +
             '<span style="textTransform:capitalize"><strong>' + label + '</strong> : ' + filtered_chkd_array + '</span>' +
             '<span onclick="removeInventoryFilter(\'' + key + '_' + filtered_chkd_array + '_filter\')" class="pull-right closX">X</span>' +
             '</li>';
    } else {
        // Checkbox filters — one tag per selected value
        for (var a in filtered_chkd_array) {
            var item = filtered_chkd_array[a];
            item = item.split(' ').join('-');
            item.split(',').forEach(function(result) {
                selecteditem = result;
                if (selecteditem !== undefined && selecteditem !== '') {
                    selecteditem = selecteditem.replace('/', ';');
                    var selectitem = selecteditem.replace(/-/g, ' ').charAt(0).toUpperCase() +
                                     selecteditem.replace(/-/g, ' ').slice(1);
                    // Special-case display names
                    if (selecteditem === 'Ski;Wakeboard-Boat') selecteditem = 'Ski/Wakeboard Boat';
                    if (selecteditem === 'Pontoon-Boats') selecteditem = 'Pontoon Boats';

                    var ky_t = key.replace(/_/g, ' ').replace(/\b\w/g, function(l) { return l.toUpperCase(); });
                    t += '<li class="' + key + '_selected_filters" id="' + key + '_' + selecteditem + '_filter">' +
                         '<span style="textTransform:capitalize"><strong>' + ky_t + '</strong> : ' + selectitem + '</span>' +
                         '<span onclick="removeInventoryFilter(\'' + key + '_' + selecteditem + '_filter\', ' + (key === 'engine_make' ? 1 : 0) + ')" ' +
                         'class="pull-right closX" data-id="' + selecteditem + '">X</span>' +
                         '</li>';
                }
            });
        }
    }

    $('.youSearchList').append(t);
    refreshInventory();
}

/**
 * Remove a single filter tag from the "You searched for" list, update the
 * corresponding hidden input, uncheck the checkbox, then refresh results.
 *
 * Replaces remove_filter, remove_newboat_filter, remove_usedboat_filter.
 *
 * @param {string} eav       - element attribute value, e.g. 'brand_Barletta_filter'
 * @param {number} checkbyid - 0 = use sanitised eav as element id; 1 = use raw eav as element id
 */
function removeInventoryFilter(eav, checkbyid) {
    checkbyid = checkbyid || 0;

    var knownKeys = ['engine_make', 'horse_power', 'pricemax', 'brand', 'model', 'class', 'series', 'category', 'length', 'year', 'condition', 'location', 'boat_type'];
    var filterKey = '';
    var filterVal = '';
    for (var ki = 0; ki < knownKeys.length; ki++) {
        var k = knownKeys[ki];
        if (eav.startsWith(k + '_')) {
            filterKey = k;
            filterVal = eav.slice(k.length + 1).replace(/_filter$/, '');
            break;
        }
    }
    if (!filterKey) {
        var params = eav.split('_');
        filterKey = params[0];
        filterVal = params.slice(1, -1).join('_');
    }

    // If a Brand filter is removed, automatically clear all dependent Model filters
    if (filterKey === 'brand') {
        // Clear the model hidden input
        $('#model_val').val(0);
        // Uncheck all model checkboxes
        $('input[type=checkbox][name="Boat-model[]"]').prop('checked', false);
        // Remove all model tags from the "You searched for" section
        $('.model_selected_filters').remove();
    }

    var checkboxvalue;

    if (checkbyid === 0) {
        var originalEav = eav; // keep original (may have spaces — slug-based tag ids)
        eav = eav.replace(/\s+/g, '-');
        // Restore special-character category names that were sanitised into the id
        if (eav === 'category_Pontoon-Boats_filter') eav = 'category_Pontoon Boats_filter';
        if (eav === 'category_Ski/Wakeboard-Boat_filter') eav = 'category_Ski/Wakeboard Boat_filter';
        if (eav === 'location_Woodland-Hills_filter') eav = 'location_Woodland Hills_filter';
        // Try hyphenated form first; fall back to original (spaces) form
        var el = document.getElementById(eav) || document.getElementById(originalEav);
        if (el) el.remove();
        checkboxvalue = filterVal.replace(/-/gi, ' ');
    } else {
        var tempid = eav.replace(/\s+/g, '-');
        if (tempid === 'category_Pontoon-Boats_filter') tempid = 'category_Pontoon Boats_filter';
        if (tempid === 'category_Ski/Wakeboard-Boat_filter') tempid = 'category_Ski/Wakeboard Boat_filter';
        var el2 = document.getElementById(tempid) || document.getElementById(eav);
        if (el2) el2.remove();
        checkboxvalue = filterVal;
    }

    // Remove the value from the hidden input's comma-separated list.
    // Case-insensitive comparison handles the slug-vs-DB-name mismatch that arises
    // when the session restore block capitalises a slug ('barletta' → 'Barletta')
    // while the hidden input still holds the original slug form.
    var all_values = $('#' + filterKey + '_val').val() || '';
    all_values = all_values.replace(/\s+/g, '-');
    var all_values_array = all_values ? all_values.split(',') : [];
    var targetVal = filterVal.replace(';', '/');
    var normalizedTarget = targetVal.toLowerCase().replace(/\s+/g, '-');
    var index = -1;
    for (var vi = 0; vi < all_values_array.length; vi++) {
        if (all_values_array[vi].toLowerCase() === normalizedTarget) {
            index = vi;
            break;
        }
    }
    if (index > -1) {
        all_values_array.splice(index, 1);
    }

    if (all_values_array.length > 0 && all_values_array[0] !== '') {
        var all_val = all_values_array.join(',').replace(/-/g, ' ');
        $('#' + filterKey + '_val').val(all_val);
    } else {
        $('#' + filterKey + '_val').val(0);
    }

    // Normalise checkbox value back to its original form for unchecking
    if (checkboxvalue === 'All') checkboxvalue = 'all';
    if (checkboxvalue === 'Ski/Wakeboard-Boat') checkboxvalue = 'Ski/Wakeboard Boat';
    if (checkboxvalue === 'Pontoon-Boats') checkboxvalue = 'Pontoon Boats';

    $('input[type=checkbox][value="' + checkboxvalue + '"]').prop('checked', false);

    refreshInventory();
}

/* -------------------------------------------------------------------------- *
 * jQuery UI range slider initialisation
 * Loops over window.FILTER_DEFS range entries — adding a new range filter only
 * requires a new SIDEBAR_FILTERS entry with the correct rangeId/displayId/etc.
 * Load order: window.FILTER_DEFS must be set before this runs (boats.hbs script tag).
 * -------------------------------------------------------------------------- */
$(function () {
    // Guard: only initialise when the inventory filter sidebar is present
    if ($('#year-range').length === 0) return;

    (window.FILTER_DEFS || []).filter(function (cfg) { return cfg.type === 'range'; })
        .forEach(function (cfg) {
            // Derive the updateInventoryFilter key from hiddenId: 'pricemax_val' → 'pricemax'
            var updateKey = cfg.hiddenId.replace(/_val$/, '');

            // Format a slider value for display (currency or plain + optional unit)
            function fmt(v) {
                if (cfg.isCurrency) return '$' + Number(v).toLocaleString();
                return v + (cfg.unit ? ' ' + cfg.unit : '');
            }

            // Helper: initialise one slider instance (desktop or mobile variant)
            function initSlider(rangeId, displayId, minId, maxId) {
                var $range  = $('#' + rangeId);
                var $disp   = $('#' + displayId);
                if (!$range.length || !$disp.length) return; // element not in DOM
                var dataMin = parseFloat($disp.data('min')) || 0;
                var dataMax = parseFloat($disp.data('max')) || 0;
                // Skip init if: no real range data (both 0), or min equals max
                // (horse_power and other new filters may have no DB data yet)
                if (dataMin === dataMax || dataMax === 0) return;
                var stored  = $('#' + cfg.hiddenId).val() || '0';
                var parts   = stored !== '0' ? stored.replace(/[a-z]/gi, '').split('-') : [];
                var v0      = parseFloat(parts[0]) || dataMin;
                var v1      = parseFloat(parts[1]) || dataMax;

                // Set initial display text
                $disp.val(fmt(v0) + ' - ' + fmt(v1));
                if (minId) $('#' + minId).text(fmt(v0));
                if (maxId) $('#' + maxId).text(fmt(v1));

                $range.slider({
                    range:  true,
                    min:    dataMin,
                    max:    dataMax,
                    step:   cfg.step || 1,
                    values: [v0, v1],
                    slide: function (_event, ui) {
                        $disp.val(fmt(ui.values[0]) + ' - ' + fmt(ui.values[1]));
                        if (minId) $('#' + minId).text(fmt(ui.values[0]));
                        if (maxId) $('#' + maxId).text(fmt(ui.values[1]));
                    },
                    stop: function (_event, ui) {
                        var v0 = ui.values[0], v1 = ui.values[1];
                        updateInventoryFilter(updateKey, (v0 === 0 && v1 === 0) ? '0' : v0 + '-' + v1);
                    },
                });
            }

            // Initialise desktop and mobile variants
            initSlider(cfg.rangeId,    cfg.displayId,    cfg.minValId,  cfg.maxValId);
            initSlider(cfg.mobRangeId, cfg.mobDisplayId, cfg.mobMinId,  cfg.mobMaxId);
        });
});
