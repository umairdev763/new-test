# Boat Inventory Filter — Complete Lifecycle & Data Flow

> Source repo: `D:\umair data\mean-idaho-master`
> This document maps every step of how filters are applied, removed, displayed, fetched,
> and reflected in the URL — with exact file + line references.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [File Map — Every File That Touches Filters](#2-file-map)
3. [The Brain — lib/inventory-url.js](#3-the-brain--libinventory-urljs)
4. [How a Filter URL Is Parsed (Server)](#4-how-a-filter-url-is-parsed-server)
5. [How MongoDB Query Is Built](#5-how-mongodb-query-is-built)
6. [Full Request Lifecycle — 3 Paths](#6-full-request-lifecycle--3-paths)
7. [How Filter Panels Are Built for the Template](#7-how-filter-panels-are-built-for-the-template)
8. [Template — boats.hbs Structure](#8-template--boatshbs-structure)
9. [Session System — How Filters Persist](#9-session-system--how-filters-persist)
10. [Client Side — How a Filter Is Applied](#10-client-side--how-a-filter-is-applied)
11. [Client Side — How a Filter Is Removed](#11-client-side--how-a-filter-is-removed)
12. [AJAX Fetch — getBoats()](#12-ajax-fetch--getboats)
13. [Dynamic Items Display After AJAX](#13-dynamic-items-display-after-ajax)
14. [SEO URL Building (Client Side)](#14-seo-url-building-client-side)
15. [URL Changes — pushState Flow](#15-url-changes--pushstate-flow)
16. [Range Sliders — Full Lifecycle](#16-range-sliders--full-lifecycle)
17. [Condition Filter — Special Behavior](#17-condition-filter--special-behavior)
18. [window.FILTER_DEFS — The Config Bridge](#18-windowfilter_defs--the-config-bridge)
19. [How to Add a Filter](#19-how-to-add-a-filter)
20. [How to Remove a Filter](#20-how-to-remove-a-filter)
21. [Key Constants Reference](#21-key-constants-reference)

---

## 1. Architecture Overview

```
lib/inventory-url.js          ← SINGLE SOURCE OF TRUTH
  ├── FILTER_CONFIG            → which filters exist, their MongoDB field names
  ├── SIDEBAR_FILTERS          → sidebar UI config (checkbox / range panels)
  ├── parseFilterUrl()         → SEO URL → parsed object
  ├── buildMongoFilter()       → parsed filters → MongoDB query
  ├── buildFilterPanels()      → template data + session → resolved panel array
  └── buildFilterUrl()         → components → URL path string

routes/inventory-filter.js    ← SEO URL route handler (mounted BEFORE index.js)
  └── wildcard regex route catches /boats-for-sale/make-barletta/ etc.

routes/index.js               ← Base route handler (no filter/location in URL)
  └── handles /boats-for-sale/, /new-boats-for-sale/, /used-boats-for-sale/

app.js
  └── inventoryFilter router mounted BEFORE index router
  └── inventoryUrl.setLocationSlugs() called on startup

views/themes/Material/boats.hbs
  ├── window.FILTER_DEFS injection  ← config bridge to client JS
  ├── {{#each filterPanels}}        ← renders ALL panels generically (mobile + desktop)
  ├── {{#each filterPanels}} hidden inputs ← session restore + AJAX state
  └── #inventory_base_path, #inventory_location hidden inputs

public/assets/js/
  ├── inventory-filter-url.js       ← URL builder, pushState, badge counts
  ├── inventory-filter-controls.js  ← checkbox handlers, slider init
  └── inventory-results.js          ← AJAX fetch, renders boat cards + filter panels
```

**Script load order (critical):**
```
inventory-filter-url.js → inventory-filter-controls.js → inventory-results.js → custom.js
```

---

## 2. File Map

| File | Role |
|------|------|
| `lib/inventory-url.js` | Config + all URL/query/panel logic |
| `routes/inventory-filter.js` | SEO URL route — parses URL, fetches data, renders |
| `routes/index.js` | Base route — session-based filtering |
| `app.js` | Router mount order, startup location slug init |
| `views/themes/Material/boats.hbs` | Template — renders panels generically |
| `public/assets/js/inventory-filter-url.js` | Client URL builder + pushState |
| `public/assets/js/inventory-filter-controls.js` | Checkbox + slider handlers |
| `public/assets/js/inventory-results.js` | AJAX fetch + DOM update |
| `lib/common.js` | `getBoatData()` — MongoDB aggregate that powers all listing pages |

---

## 3. The Brain — lib/inventory-url.js

Everything filter-related derives from three exported objects in this file.

### FILTER_CONFIG

Maps URL key → MongoDB field name + enabled flag.

```js
const FILTER_CONFIG = {
    type:   { enabled: true, label: 'Category', field: 'category'      }, // URL: /type-pontoon/
    make:   { enabled: true, label: 'Brand',    field: 'boat_brand'    }, // URL: /make-barletta/
    model:  { enabled: true, label: 'Model',    field: 'boat_model'    }, // URL: /model-x24/
    price:  { enabled: true, label: 'Price',    field: 'boatPrice'     }, // URL: /price-20000-50000/
    year:   { enabled: true, label: 'Year',     field: 'boat_year'     }, // URL: /year-2020-2023/
    length: { enabled: true, label: 'Length',   field: 'boat_length'   }, // URL: /length-20-28ft/
    hours:  { enabled: true, label: 'Hours',    field: 'engine_hours'  }, // URL: /hours-0-100/
    search: { enabled: true, label: 'Search',   field: 'boat_name_val' }, // URL: /search-keyword/
    series: { enabled: true, label: 'Series',   field: 'boat_series'   }, // URL: /series-x-star/
    class:  { enabled: true, label: 'Class',    field: 'boat_class'    }, // URL: /class-wakesurf/
};
```

Setting `enabled: false` disables the filter from ALL layers simultaneously:
URL parsing, MongoDB query, URL building, and sitemap generation.

### FILTER_ORDER

```js
const FILTER_ORDER = ['type', 'make', 'model', 'class', 'price', 'year', 'length', 'hours'];
```

Controls the order of URL path segments. Independent of sidebar panel order.

### SIDEBAR_FILTERS

Array of panel configs. Controls:
- Which panels appear in the sidebar
- Panel order (independent of URL order)
- Whether each panel is checkbox or range type
- All HTML element IDs used by the JS

**Checkbox entry:**
```js
{
    key:          'brand',      // HTML id prefix, JS filter key
    label:        'Brand',      // sidebar heading
    type:         'checkbox',
    urlPrefix:    'make',       // URL segment: /make-barletta/
    hiddenId:     'brand_val',  // hidden input id + session key
    checkboxName: 'Brand[]',    // HTML name on checkboxes
    dataKey:      'boat_brand', // key in template data holding items array
    hasAll:       false,        // show "All" option?
    skipEmpty:    true,         // skip null/_id items?
}
```

**Range entry:**
```js
{
    key:          'year',
    label:        'Year',
    type:         'range',
    urlPrefix:    'year',
    hiddenId:     'year_val',            // stores "2020-2023"
    rangeId:      'year-range',          // desktop slider div id
    displayId:    'amount-year',         // desktop text input (holds data-min/max)
    mobRangeId:   'year-range-mob',      // mobile slider div id
    mobDisplayId: 'amount-year-mob',     // mobile text input
    minValId:     'year-min-value',      // desktop min label span
    maxValId:     'year-max-value',      // desktop max label span
    mobMinId:     'mob-year-min-value',  // mobile min label span
    mobMaxId:     'mob-year-max-value',  // mobile max label span
    minDataAttr:  'minyear',             // data-minyear attr on display input
    maxDataAttr:  'maxyear',             // data-maxyear attr on display input
    minKey:       'minYear',             // key in route data
    maxKey:       'maxYear',             // key in route data
}
```

---

## 4. How a Filter URL Is Parsed (Server)

**Function:** `inventoryUrl.parseFilterUrl(req.path)` in `lib/inventory-url.js`

**Input:** `/new-boats-for-sale-sacramento/type-pontoon/make-barletta/year-2020-2023/page-2/`

**Process:**
1. Strip leading/trailing slashes, split on `/`
2. First segment: match against `BASE_PATHS` (sorted longest-first to avoid prefix collisions)
   - Exact match → `basePath = 'new-boats-for-sale'`, no location
   - `basePath + '-something'` → location = `'sacramento'`
3. Remaining segments: each matched by prefix (`type-`, `make-`, `year-`, `page-` etc.)
   - Checkbox filters extract the slug value: `make-barletta` → `filters.make = 'barletta'`
   - Range filters split on `-`: `year-2020-2023` → `filters.year = { min: 2020, max: 2023 }`
   - Length strips `ft` suffix: `length-20-25ft` → `filters.length = { min: 20, max: 25 }`
   - `page-2` → `page = 2`
   - Disabled filters (FILTER_CONFIG[key].enabled === false) are silently skipped

**Output:**
```js
{
  basePath:  'new-boats-for-sale',
  condition: 'New',               // from CONDITION_MAP
  location:  'sacramento',
  filters:   { type: 'pontoon', make: 'barletta', year: { min: 2020, max: 2023 } },
  page:      2
}
```

**Location validation:** Checked against `locationSlugs` array set on app startup from `company_profile.company_locations`. If `locationSlugs` is empty (not yet loaded), any valid slug shape is accepted.

---

## 5. How MongoDB Query Is Built

**Function:** `inventoryUrl.buildMongoFilter(parsedFilters, condition, req.query)`

**Multi-value merge:** Extra values arrive as query params: `/make-barletta/?make=bennington`
```js
function mergeWithQuery(pathVal, queryKey) {
    // pathVal = 'barletta', req.query.make = 'bennington'
    // → ['barletta', 'bennington']
}
```

**Filter-to-MongoDB mapping:**

| URL key | MongoDB field | Match type |
|---------|--------------|------------|
| `type` | `category` | Partial regex — `pontoon` matches `Pontoon Boats`. Hyphens match space/hyphen/slash |
| `make` | `boat_brand` | Exact case-insensitive: `^barletta$` |
| `model` | `boat_model` | Partial regex |
| `series` | `boat_series` | Partial regex |
| `class` | `boat_class` | Partial regex |
| `price` | `boatPrice` | `$gte`/`$lte` range |
| `year` | `boat_year` | `$gte`/`$lte` range |
| `length` | `boat_length` | `$gte`/`$lte` range |
| `hours` | `engine_hours` | `$gte`/`$lte` range |
| `search` | `boatTitle`, `stock_number`, `boat_brand`, `boat_make`, `boat_model`, `boat_year` | `$or` regex |
| `location` | *(none)* | SEO-only — not stored in DB |

**Condition mapping:**
- `boats-for-sale` → no condition filter (all boats)
- `new-boats-for-sale` → `{ boat_condition: 'New' }`
- `used-boats-for-sale` → `{ boat_condition: 'Used' }`

---

## 6. Full Request Lifecycle — 3 Paths

### Path A: SEO Filter URL (Server-Side Render)

```
Browser: GET /new-boats-for-sale/make-barletta/
│
▼ app.js — inventoryFilter router (registered BEFORE index router)
│
▼ routes/inventory-filter.js — wildcard regex route
  Guard check: hasLocation || hasFilter? → YES, proceed
│
├── parseFilterUrl(req.path)
│     → { basePath: 'new-boats-for-sale', condition: 'New',
│          location: null, filters: { make: 'barletta' }, page: null }
│
├── buildMongoFilter(parsed.filters, 'New', req.query)
│     → { boat_condition: 'New', boat_brand: /^barletta$/i }
│
├── common.getBoatData(req, page, filter, sort)   ← lib/common.js
│     → MongoDB aggregate returns:
│        { data: [...boats], boat_brand: [...], boat_model: [...],
│          boat_condition: [...], category: [...],
│          min_Length, max_Length, min_year, max_year, min_price, max_price, ... }
│
├── buildCanonicalUrl() → "https://site.com/new-boats-for-sale/make-barletta/"
│
├── shouldNoindex(req.query, parsed.filters) → false (no extra query params)
│
├── matchBrandSlug('barletta') → 'Barletta'  (actual DB value)
│   matchCategorySlug(), matchModelSlug()     (same process)
│
├── sessionData = {
│     condition_val: 'New', brand_val: 'Barletta', category_val: 0,
│     model_val: 0, year_val: 0, length_val: 0, pricemax_val: 0,
│     boat_name_val: 0, location_val: 0, class_val: 0, series_val: 0
│   }
│
├── templateData = { boat_brand, boat_model, boat_condition, boat_category,
│                    minLength, maxLength, minYear, maxYear, minPrice, maxPrice }
│
├── buildFilterPanels(templateData, sessionData)
│     → filterPanels array (each panel has items[], checked booleans, allChecked)
│
└── res.render('boats', {
      filterPanels, filterDefs: JSON.stringify(SIDEBAR_FILTERS),
      session: sessionData, basePath, locationSlug, canonicalUrl, noindex,
      paginateUrl, pageTitle, ... })
```

### Path B: Base Route (Session-Based, No Filter/Location in URL)

```
Browser: GET /boats-for-sale/
│
▼ routes/inventory-filter.js — wildcard route
  Guard: hasLocation=false, hasFilter=false → next()
│
▼ routes/index.js — router.all('/:type(boats-for-sale|...)')
│
├── Uses req.session['boats-for-sale'] for all filter values
├── Builds MongoDB filter from session values directly
├── common.getBoatData(req, page, filter, sort)
├── buildFilterPanels(templateData, req.session['boats-for-sale'])
└── res.render('boats', { filterPanels, filterDefs, session: req.session[type], ... })
```

### Path C: AJAX Filter Change (Client-Side)

```
User ticks "Barletta" checkbox
│
▼ filterCheckboxSelected('brand', element)   ← inventory-filter-controls.js
│  Collects all checked Brand[] values → ['Barletta']
│
▼ updateInventoryFilter('brand', ['Barletta'])
│  ├── $('#brand_val').val('Barletta')        ← writes hidden input
│  ├── Removes old .brand_selected_filters tags from .youSearchList
│  ├── Appends new <li> tag with removeInventoryFilter() onclick
│  └── refreshInventory() → getBoats()
│
▼ getBoats()   ← inventory-results.js
│  Reads all .boat_filter hidden inputs into data object
│  POST /{listingPageSlug}?json=true
│  data = { brand_val: 'Barletta', condition_val: 0, year_val: 0, ... }
│
▼ Server receives AJAX POST
│  Reads req.body.brand_val = 'Barletta'
│  Saves to req.session['boats-for-sale'].brand_val = 'Barletta'
│  Builds MongoDB filter: { boat_brand: /^Barletta$/i }
│  Returns JSON: { success, boats, boat_brand, boat_model, minLength, maxLength, ... }
│
▼ getBoats() success callback
│  ├── renderCheckboxFilter(cfg, items) for each checkbox panel
│  ├── Updates range sliders from msg.minLength/maxLength etc.
│  ├── Writes boat cards HTML to #boats-list
│  ├── Writes load-more pagination to #loadMore_pag
│  ├── initializeBoatSliders()  (from custom.js)
│  ├── window.applyView(localStorage.getItem('boatView'))
│  └── updateBrowserUrl()
│
▼ updateBrowserUrl()   ← inventory-filter-url.js
│  buildInventoryFilterUrl()
│    → reads all hidden inputs
│    → assembles: /boats-for-sale/make-barletta/
│  history.pushState({ inventoryFilter: true }, '', '/boats-for-sale/make-barletta/')
└── updatePageHeading() → updates h1.boatsHeading text
```

---

## 7. How Filter Panels Are Built for the Template

**Function:** `inventoryUrl.buildFilterPanels(data, session)` in `lib/inventory-url.js`

Called by BOTH routes before `res.render`. Loops over every entry in `SIDEBAR_FILTERS`:

**For checkbox panels:**
```
data['boat_brand'] = [
    { _id: 'Barletta', count: 12 },
    { _id: 'MasterCraft', count: 8 },
    ...
]
session['brand_val'] = 'Barletta'

→ maps each item, adds checked boolean via two-way comparison:
   1. Direct: sv.toLowerCase() === item._id.toLowerCase()  (DB name match)
   2. Slug:   slugify(sv) === slugify(item._id)             (URL slug match)

→ panel.items = [
    { _id: 'Barletta',   count: 12, checked: true  },
    { _id: 'MasterCraft', count: 8, checked: false },
]
→ panel.allChecked = false   (brand_val is not '0' or '')
```

**For range panels:**
```
data['minYear'] = 2018
data['maxYear'] = 2025

→ panel.minValue = 2018
→ panel.maxValue = 2025
```

Template then uses `{{this.minValue}}` for `data-min` attribute on the slider display input.

---

## 8. Template — boats.hbs Structure

```
<script>window.FILTER_DEFS = {{{filterDefs}}};</script>   ← config bridge to JS

<!-- TOP FILTER BUTTON BAR -->
{{#each filterPanels}}
  <div class="inner_wrap_bt">
    <a title="{{this.key}}">{{this.label}} <span class="selected-count"></span></a>
  </div>
{{/each}}

<!-- SIDEBAR — MOBILE -->
{{#each filterPanels}}
  {{#ifCond this.type '==' 'checkbox'}}
    <div id="{{this.key}}-filter-mob">
      {{#each this.items}}
        <input type="checkbox" onchange="filterCheckboxSelected('{{../key}}', this)"
          name="{{../checkboxName}}" value="{{this._id}}"
          {{#if this.checked}}checked{{/if}}>
      {{/each}}
    </div>
  {{/ifCond}}
  {{#ifCond this.type '==' 'range'}}
    <input type="text" id="{{this.mobDisplayId}}" />
    <div id="{{this.mobRangeId}}"></div>
  {{/ifCond}}
{{/each}}

<!-- SIDEBAR — DESKTOP -->
{{#each filterPanels}}
  {{#ifCond this.type '==' 'checkbox'}}
    <div id="{{this.key}}-filter">
      {{#each this.items}}
        <input type="checkbox" onchange="filterCheckboxSelected('{{../key}}', this)"
          name="{{../checkboxName}}" value="{{this._id}}"
          {{#if this.checked}}checked{{/if}}>
      {{/each}}
    </div>
  {{/ifCond}}
  {{#ifCond this.type '==' 'range'}}
    <div id="{{this.rangeId}}"></div>
    <input type="text" id="{{this.displayId}}"
      data-min={{this.minValue}} data-max={{this.maxValue}}>
  {{/ifCond}}
{{/each}}

<!-- FORM — HIDDEN INPUTS (state storage + AJAX POST data) -->
<form id="boats_search_form" action="/{{paginateUrl}}">
  {{#each filterPanels}}
    <input type="hidden" class="boat_filter"
      id="{{this.hiddenId}}" name="{{this.hiddenId}}"
      value="{{lookup ../session this.hiddenId}}">
  {{/each}}
</form>

<!-- SEO URL DATA -->
<input type="hidden" id="inventory_base_path" value="{{basePath}}" />
<input type="hidden" id="inventory_location"  value="{{locationSlug}}" />
<input type="hidden" id="paginateUrl"          value="{{paginateUrl}}" />
```

**Key: `{{lookup ../session this.hiddenId}}`**
This Handlebars `lookup` helper dynamically reads `session.brand_val`, `session.year_val` etc. by using `this.hiddenId` as the key. This is how session-restored filter values pre-fill hidden inputs on page load.

---

## 9. Session System — How Filters Persist

**Session namespace:** `req.session[pageType]` e.g. `req.session['boats-for-sale']`

**Session keys (one per filter):**

| Key | Example value | Meaning |
|-----|--------------|---------|
| `brand_val` | `'Barletta'` or `'Barletta,MasterCraft'` | Comma-separated DB names |
| `condition_val` | `'New'` or `0` | Single value or 0 |
| `category_val` | `'Pontoon Boats'` | DB name |
| `model_val` | `'X24,Aria 20L'` | Comma-separated |
| `year_val` | `'2020-2023'` | min-max string |
| `length_val` | `'20-28'` | min-max string |
| `pricemax_val` | `'30000-70000'` | min-max string |
| `boat_name_val` | `'pontoon'` or `0` | Search text |
| `series_val` | `0` | Comma-separated or 0 |
| `class_val` | `0` | Comma-separated or 0 |
| `location_val` | `0` | Legacy, unused |

**Zero convention:** `0` (as a string `'0'`) means "not set / no filter". Default for all keys. `buildFilterPanels()` treats `'0'` and `''` as unfiltered.

**Restore flow:**
1. Page load → server reads `req.session[type]` → passes as `session:` to template
2. `{{lookup ../session this.hiddenId}}` pre-fills each hidden input
3. `checkZeroResult()` fires on DOM ready → calls `refreshInventory()` (AJAX)
4. AJAX response → server reads `req.body.*_val` → updates session → returns filtered data

---

## 10. Client Side — How a Filter Is Applied

**Entry point:** `filterCheckboxSelected(filterKey, element)` in `inventory-filter-controls.js`

Called from every checkbox: `onchange="filterCheckboxSelected('brand', this)"`

```
1. Collect all currently-checked values from checkboxes with same name attr
   → chked_vals = 'Barletta,MasterCraft,'

2. Deduplicate: [...new Set(chked_vals.split(','))].join(',')
   → 'Barletta,MasterCraft'

3. Call updateInventoryFilter('brand', ['Barletta,MasterCraft'])

   updateInventoryFilter:
   ├── $('#brand_val').val('Barletta,MasterCraft')  ← write hidden input
   ├── $('.brand_selected_filters').remove()         ← clear old tags
   ├── Build <li> tags for .youSearchList:
   │     <li class="brand_selected_filters" id="brand_Barletta_filter">
   │       Brand : Barletta
   │       <span onclick="removeInventoryFilter('brand_Barletta_filter')">X</span>
   │     </li>
   ├── $('.youSearchList').append(tags)
   └── refreshInventory() → getBoats()
```

---

## 11. Client Side — How a Filter Is Removed

**Two entry points:**
1. User clicks X tag → `removeInventoryFilter('brand_Barletta_filter', 0)`
2. User unchecks checkbox → `filterCheckboxSelected` calls `removeInventoryFilter`

**`removeInventoryFilter(eav, checkbyid)` in `inventory-filter-controls.js`:**

`eav` format: `'brand_Barletta_filter'` (key `_` value `_filter`)

```
1. Parse eav → params = ['brand', 'Barletta', 'filter']

2. Special case: if key === 'brand', also clear model:
   $('#model_val').val(0)
   uncheck all Boat-model[] checkboxes
   remove all .model_selected_filters tags

3. Find and remove the <li> tag from .youSearchList
   (id lookup with fallback for spaces/slashes in category names)

4. Remove value from hidden input's comma-separated list:
   $('#brand_val').val() → 'Barletta,MasterCraft'
   after remove 'Barletta' → 'MasterCraft'
   → $('#brand_val').val('MasterCraft')
   if no values remain → $('#brand_val').val(0)

5. Uncheck the checkbox:
   $('input[type=checkbox][value="Barletta"]').prop('checked', false)

6. refreshInventory() → getBoats()
```

---

## 12. AJAX Fetch — getBoats()

**File:** `public/assets/js/inventory-results.js`

```js
function getBoats(no_boat_msg) {
    var ctx = getPageContext(); // 'new' | 'used' | 'all'
    var listingPageSlug = $('input[name="listing_page_slug"]').val(); // e.g. 'boats-for-sale'

    // Build data object from all .boat_filter hidden inputs
    var data = {};
    var dataAttr = ctx === 'all' ? 'id' : 'name';
    $('.boat_filter').each(function() {
        data[$(this).attr(dataAttr)] = $(this).val();
    });
    // e.g. data = { brand_val: 'Barletta', year_val: '2020-2023', condition_val: 0, ... }

    var url = '/' + listingPageSlug + '?json=true';

    $.ajax({
        type: 'POST',
        url: url,      // POST /boats-for-sale?json=true
        data: data,
        success: function(msg) { ... }
    });
}
```

**Server receives POST:**
- Reads `req.body.*_val` values
- Saves to `req.session[type].*_val`
- Rebuilds MongoDB filter from session
- Returns `{ success, boats, boat_brand, boat_model, boat_condition, boat_category, minLength, maxLength, minYear, maxYear, minPrice, maxPrice, totalBoats, pageCount, current_page }`

---

## 13. Dynamic Items Display After AJAX

After `getBoats()` success callback:

**Boat cards:** Built from `msg.boats` array using template literal HTML, written to `#boats-list`

**Checkbox filters re-rendered via `renderCheckboxFilter(cfg, items)`:**
```
For each checkbox panel in window.FILTER_DEFS:
  items = msg[cfg.dataKey]   e.g. msg.boat_brand = [{ _id: 'Barletta', count: 12 }, ...]
  selectedVal = $('#brand_val').val()   e.g. 'Barletta'

  For each item:
    normVal() comparison (slug-vs-DB name) → add checked attr if selected
    Build checkbox HTML

  If selected values not in returned items (filtered away):
    Still render them as checked so user can deselect

  Write desktop HTML to #brand-filter
  Write mobile HTML  to #brand-filter-mob
```

**Range sliders updated:**
```
For each range panel in window.FILTER_DEFS:
  msg.minLength, msg.maxLength (from server)
  Stored value: $('#length_val').val() e.g. '20-28'

  newMin = max(storedMin, msg.minLength)   (keeps user selection within new range)
  newMax = min(storedMax, msg.maxLength)

  $('#amount-length').val('20 ft - 28 ft')   ← display input
  $('#length-range').slider('option', { min, max, values: [newMin, newMax] })
  $('#length-range-mob').slider(...)
```

**Load more pagination:**
- If `msg.pageCount > msg.current_page` → show Load More button
- Otherwise → hide it

---

## 14. SEO URL Building (Client Side)

**Function:** `buildInventoryFilterUrl()` in `inventory-filter-url.js`

Reads hidden inputs and assembles SEO URL:

```
1. basePath = $('#inventory_base_path').val()  → 'boats-for-sale'
   (updated by condition filter to 'new-boats-for-sale' etc.)

2. location = $('#inventory_location').val()   → '' or 'sacramento'
   base = 'boats-for-sale' + (location ? '-sacramento' : '')

3. Sort FILTER_DEFS by URL_PREFIX_ORDER:
   ['type', 'make', 'model', 'series', 'price', 'year', 'length', 'hours']

4. For each def with urlPrefix:
   Checkbox: val = $('#brand_val').val() = 'Barletta,MasterCraft'
     → first value → path segment: /make-barletta/
     → extra values → queryParts: ['make=mastercraft']

   Range: val = $('#year_val').val() = '2020-2023'
     → path segment: /year-2020-2023/
     Length appends unit: /length-20-28ft/

5. Search appended last: /search-keyword/

6. Result: /boats-for-sale/make-barletta/year-2020-2023/
   With multi-select: /boats-for-sale/make-barletta/?make=mastercraft
```

---

## 15. URL Changes — pushState Flow

**Function:** `updateBrowserUrl()` in `inventory-filter-url.js`

```
After every AJAX success:
  newUrl = buildInventoryFilterUrl()
  currentUrl = window.location.pathname + window.location.search

  if (newUrl !== currentUrl):
    history.pushState({ inventoryFilter: true }, '', newUrl)

  updatePageHeading()  → rebuilds h1.boatsHeading:
    "{Condition} Boats For Sale [in {Location}] [- {Brand}] [- {Category}]"
```

**Back/Forward navigation:**
```js
window.addEventListener('popstate', function(event) {
    if (event.state && event.state.inventoryFilter) {
        window.location.reload();  // full page reload → server renders correct SSR
    }
});
```

**Badge counts:** `updateFilterCounts()` reads every `.boat_filter` hidden input, counts comma-separated values, updates `<span>` inside matching sidebar button.

---

## 16. Range Sliders — Full Lifecycle

**Init (DOM ready) in `inventory-filter-controls.js`:**
```
Loops over window.FILTER_DEFS where type === 'range'
For each (e.g. year):
  dataMin = $('#amount-year').data('min')   ← from template: data-min={{this.minValue}}
  dataMax = $('#amount-year').data('max')   ← from template: data-max={{this.maxValue}}
  stored = $('#year_val').val()             ← from session: '2020-2023' or '0'

  v0 = stored ? 2020 : dataMin
  v1 = stored ? 2023 : dataMax

  $('#amount-year').val('2020 - 2023')
  $('#year-range').slider({
    range: true, min: dataMin, max: dataMax, step: 1,
    values: [v0, v1],
    slide: function(e, ui) { update display spans },
    stop:  function(e, ui) { updateInventoryFilter('year', '2020-2023') }
  })

  Same for mobile: $('#year-range-mob')
```

**updateInventoryFilter for range:**
```
updateInventoryFilter('year', '2020-2023')
  → $('#year_val').val('2020-2023')
  → .youSearchList gets tag: "Year : 2020-2023"  with X button
  → refreshInventory() → getBoats()
```

**AJAX response updates slider:**
```
msg.minYear = 2018, msg.maxYear = 2025
stored = '2020-2023'
  → newMin = max(2020, 2018) = 2020   (keep user selection)
  → newMax = min(2023, 2025) = 2023

$('#year-range').slider('option', { min: 2018, max: 2025, values: [2020, 2023] })
```

---

## 17. Condition Filter — Special Behavior

Condition is the only filter that changes the URL BASE PATH (not a segment).

```
filterCheckboxSelected('condition', element)
│
├── Uncheck all other condition checkboxes (radio-button behavior)
│
├── Set $('#condition_val').val(element.value) or 0
│
├── Determine new base path:
│   'New'  → newBase = 'new-boats-for-sale'
│   'Used' → newBase = 'used-boats-for-sale'
│   all    → newBase = 'boats-for-sale'
│
├── $('#inventory_base_path').val(newBase)
│
└── window.location.href = buildInventoryFilterUrl()
    → FULL PAGE NAVIGATION (not AJAX)
    → Server handles /new-boats-for-sale/ with correct condition filter
```

This causes a full page reload because condition changes the route itself.

---

## 18. window.FILTER_DEFS — The Config Bridge

**Set in boats.hbs:**
```hbs
<script>window.FILTER_DEFS = {{{filterDefs}}};</script>
```

`filterDefs` = `JSON.stringify(inventoryUrl.SIDEBAR_FILTERS)` — the full array from `lib/inventory-url.js`.

**Used by client JS for:**
- `inventory-filter-controls.js`: slider init loop iterates range entries
- `inventory-results.js`:
  - `renderCheckboxFilter` loop iterates checkbox entries
  - Range slider update loop iterates range entries
- `inventory-filter-url.js`: `buildInventoryFilterUrl` sorts and iterates all entries

This means **adding a new filter to SIDEBAR_FILTERS automatically makes all client JS handle it** — no client JS changes needed.

---

## 19. How to Add a Filter

**4 steps, one file is the main change:**

### Step 1 — `lib/inventory-url.js` → FILTER_CONFIG
```js
color: { enabled: true, label: 'Color', field: 'boat_color' },
```

Add to `FILTER_ORDER`:
```js
const FILTER_ORDER = ['type', 'make', 'model', 'class', 'price', 'year', 'length', 'hours', 'color'];
```

### Step 2 — `lib/inventory-url.js` → SIDEBAR_FILTERS
```js
{
    key: 'color', label: 'Color', type: 'checkbox', urlPrefix: 'color',
    hiddenId: 'color_val', checkboxName: 'Color[]',
    dataKey: 'boat_color', skipEmpty: true,
},
```

### Step 3 — `routes/index.js` + `routes/inventory-filter.js`
- In MongoDB aggregate `$group` stage, add `boat_color` to grouped fields
- Pass in `res.render`: `boat_color: results.boat_color`
- Add session reset: `req.session[sessionName].color_val = 0`
- Add MongoDB filter query:
  ```js
  if (req.session[sessionName].color_val && req.session[sessionName].color_val !== '0') {
      filter.boat_color = { $in: req.session[sessionName].color_val.split(',') };
  }
  ```

### Step 4 — Template (boats.hbs)
**Nothing to change.** The `{{#each filterPanels}}` loops handle it automatically.
`window.FILTER_DEFS` makes all client JS handle it automatically.

---

## 20. How to Remove a Filter

### Option A — Disable completely (keep URL routing)
```js
// lib/inventory-url.js → FILTER_CONFIG
hours: { enabled: false, label: 'Hours', field: 'engine_hours' },
```
Disables URL parsing, MongoDB query, URL building, sitemap. Panel still disappears from sidebar.

Then in `SIDEBAR_FILTERS`, comment out or delete the entry:
```js
// { key: 'hours', label: 'Engine Hours', type: 'range', ... },
```

### Option B — Hide sidebar panel only (keep URL routing active)
Leave `FILTER_CONFIG` with `enabled: true`. In `SIDEBAR_FILTERS`, just remove the entry. The URL `/hours-0-100/` still resolves but no UI panel is shown.

---

## 21. Key Constants Reference

| Constant | Location | Value |
|----------|----------|-------|
| `BASE_PATHS` | `lib/inventory-url.js` | `['boats-for-sale', 'new-boats-for-sale', 'used-boats-for-sale']` |
| `CONDITION_MAP` | `lib/inventory-url.js` | Maps basePath → `null` / `'New'` / `'Used'` |
| `FILTER_ORDER` | `lib/inventory-url.js` | URL segment order: `['type', 'make', 'model', ...]` |
| `FILTER_CONFIG` | `lib/inventory-url.js` | Master filter registry |
| `SIDEBAR_FILTERS` | `lib/inventory-url.js` | UI panel configs |
| `URL_PREFIX_ORDER` | `inventory-filter-url.js` (client) | Client-side URL segment order (mirrors FILTER_ORDER) |
| Zero convention | Session | `0` (string `'0'`) = no filter applied |
| `paginateUrl` | `#paginateUrl` hidden input | The listing slug used as AJAX POST target |
| `listing_page_slug` | `input[name=listing_page_slug]` | Same as paginateUrl, read by `getBoats()` |

---

## Data Flow Diagram — One-Page Summary

```
FILTER_CONFIG + SIDEBAR_FILTERS  (lib/inventory-url.js)
         │
         ├──[server]──► parseFilterUrl()        URL → filter object
         │              buildMongoFilter()       filters → MongoDB query
         │              common.getBoatData()     query → { boats, brand list, year range, ... }
         │              buildFilterPanels()      data + session → panel array
         │              res.render('boats', {
         │                filterPanels,          ← checkbox items with checked booleans
         │                filterDefs,            ← JSON stringified SIDEBAR_FILTERS
         │                session,               ← current filter values
         │                basePath,              ← 'boats-for-sale' etc.
         │              })
         │
         │──[template]─► window.FILTER_DEFS = filterDefs    ← config bridge
         │               {{#each filterPanels}} → sidebar HTML (all panels)
         │               {{lookup session hiddenId}} → pre-filled hidden inputs
         │
         ├──[client init]─► checkZeroResult() → refreshInventory() → getBoats()
         │                  slider init loop reads FILTER_DEFS range entries
         │                  updateFilterCounts() reads .boat_filter inputs → badge counts
         │
         ├──[user action]─► filterCheckboxSelected(key, el)
         │                   → updateInventoryFilter(key, vals)
         │                   → write hidden input + .youSearchList tags
         │                   → refreshInventory() → getBoats() [AJAX POST]
         │
         ├──[AJAX response]─► renderCheckboxFilter() per checkbox panel
         │                    range slider update per range panel
         │                    boat cards → #boats-list
         │                    updateBrowserUrl() → buildInventoryFilterUrl() → pushState
         │                    updatePageHeading() → h1.boatsHeading
         │
         └──[remove]──► removeInventoryFilter(eav)
                        → remove <li> tag
                        → remove value from hidden input
                        → uncheck checkbox
                        → refreshInventory()
```
