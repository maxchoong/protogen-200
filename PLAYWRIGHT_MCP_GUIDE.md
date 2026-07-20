---
title: Playwright MCP Practical Guide – Film Advisor Testing
description: Hands-on examples of using Playwright MCP to test the Lumera app
---

# Playwright MCP Practical Guide

## What We Just Did

We successfully used Playwright MCP to test your Film Advisor app (Lumera) by:

1. ✅ Navigating to the app
2. ✅ Finding and clicking a sample prompt
3. ✅ Waiting for recommendations to load
4. ✅ Taking screenshots of the results
5. ✅ Opening a details panel
6. ✅ Navigating between recommendations

---

## Key Playwright MCP Tools Used

### 1. **Navigation**

```
Tool: mcp_playwright_browser_navigate
Purpose: Load a URL in the browser

Example:
  URL: https://protogen-200.vercel.app/
  Result: Page loaded, title set to "Lumera"
```

### 2. **Finding Elements**

```
Tool: mcp_playwright_browser_find
Purpose: Locate elements by text content or regex

Example 1 - Find by text:
  Query: "Something funny with Ryan Gosling"
  Result: Located button [ref=e27]

Example 2 - Find by text:
  Query: "More details"
  Result: Multiple matches found, picked first one [ref=e143]
```

### 3. **Clicking Elements**

```
Tool: mcp_playwright_browser_click
Purpose: Click a button or interactive element

Example 1 - Click sample prompt:
  Target: ref=e27 (Something funny with Ryan Gosling button)
  Result: Clicked successfully

Example 2 - Click More details:
  Target: ref=e143 (More details for The Fall Guy)
  Result: Details panel opened

Example 3 - Click Next:
  Target: ref=e226 (Next title button)
  Result: Panel updated to La La Land (2 of 7)
```

### 4. **Taking Screenshots**

```
Tool: mcp_playwright_browser_take_screenshot
Purpose: Capture the viewport as PNG or JPEG

Example - Screenshot results:
  Type: "png"
  Scale: "css"
  Result: Saved to .playwright-mcp/page-2026-07-20T15-07-24-581Z.png
  Shows: Home page with 7 recommendations

Example - Screenshot details panel:
  Type: "png"
  Scale: "css"
  Result: Saved to .playwright-mcp/page-2026-07-20T15-07-38-041Z.png
  Shows: The Fall Guy details with metadata, cast, streaming options
```

### 5. **Taking Accessibility Snapshots**

```
Tool: mcp_playwright_browser_snapshot
Purpose: Get the accessibility tree (DOM structure) of the page

Result shows:
  - All interactive elements with role info
  - Text content and labels
  - Element references (e.g., [ref=e27])
  - Cursor/pointer information for clickable items

Useful for:
  - Understanding page structure
  - Finding element references
  - Verifying element visibility/status
  - Inspecting nested content
```

---

## Test Scenarios Covered

### Scenario 1: Load Home Page
**Goal:** Verify the app loads and displays sample prompts  
**Steps:**
1. Navigate to `https://protogen-200.vercel.app/`
2. Take screenshot
3. Find heading "What are you in the mood for?"
4. Verify 4 sample prompt buttons are visible

**Tools Used:**
- `mcp_playwright_browser_navigate`
- `mcp_playwright_browser_take_screenshot`
- `mcp_playwright_browser_find`

---

### Scenario 2: Click Sample Prompt and View Results
**Goal:** Test the recommendation flow  
**Steps:**
1. Navigate to app
2. Find button "Something funny with Ryan Gosling"
3. Click the button
4. Wait for recommendations to load
5. Take screenshot of results
6. Verify 7 recommendations are displayed

**Tools Used:**
- `mcp_playwright_browser_navigate`
- `mcp_playwright_browser_find`
- `mcp_playwright_browser_click`
- `mcp_playwright_browser_snapshot` (to verify load)
- `mcp_playwright_browser_take_screenshot`

**Results Verified:**
- ✓ Heading: "Recommendations"
- ✓ Query echoed: "Something funny with Ryan Gosling"
- ✓ Intent detected: "Intent: talent"
- ✓ Confidence: 90%
- ✓ 7 results displayed:
  - The Fall Guy
  - La La Land
  - Barbie
  - The Nice Guys
  - The Big Short
  - Crazy, Stupid, Love.
  - Lars and the Real Girl

---

### Scenario 3: Open Movie Details Panel
**Goal:** Test the details panel functionality  
**Steps:**
1. From results page, find "More details" button
2. Click the button for The Fall Guy
3. Wait for panel to open
4. Take screenshot

**Tools Used:**
- `mcp_playwright_browser_find`
- `mcp_playwright_browser_click`
- `mcp_playwright_browser_take_screenshot`

**Details Panel Contains:**
- ✓ Movie title: "The Fall Guy"
- ✓ Year, type, runtime, rating: "2024 • FILM • 2H 7M • 7.0/10"
- ✓ Lumera note (editorial explanation)
- ✓ Streaming availability: Netflix, Apple TV, Prime Video
- ✓ Watch trailer button
- ✓ Full synopsis
- ✓ Cast: Ryan Gosling, Emily Blunt, Aaron Taylor-Johnson, Hannah Waddingham
- ✓ Directors: Chris O'Hara, Paul Barry
- ✓ Genres: Action, Comedy, Romance
- ✓ Language: English
- ✓ Navigation: "1 of 7" with Previous/Next buttons

---

### Scenario 4: Navigate Between Recommendations
**Goal:** Test panel navigation  
**Steps:**
1. In details panel, find "Next" button
2. Click Next button
3. Wait for panel to update
4. Take screenshot

**Tools Used:**
- `mcp_playwright_browser_find`
- `mcp_playwright_browser_click`
- `mcp_playwright_browser_take_screenshot`

**Navigation Results:**
- ✓ Moved from "1 of 7" to "2 of 7"
- ✓ Now showing: "La La Land"
- ✓ Year: 2016
- ✓ Rating: 7.9/10
- ✓ Previous button now enabled
- ✓ New details, cast, synopsis loaded

---

## All Available Playwright MCP Tools

### Navigation
- `mcp_playwright_browser_navigate(url)` — Load a URL
- `mcp_playwright_browser_navigate_back()` — Go back in history

### Interaction
- `mcp_playwright_browser_click(target)` — Click element
- `mcp_playwright_browser_type(target, text, submit?)` — Type text
- `mcp_playwright_browser_press_key(key)` — Press keyboard key
- `mcp_playwright_browser_hover(target)` — Hover over element
- `mcp_playwright_browser_drag(startTarget, endTarget)` — Drag & drop
- `mcp_playwright_browser_fill_form(fields)` — Fill multiple fields
- `mcp_playwright_browser_select_option(target, values)` — Select dropdown

### Screenshots & Inspection
- `mcp_playwright_browser_take_screenshot()` — Screenshot viewport
- `mcp_playwright_browser_snapshot()` — Get accessibility tree
- `mcp_playwright_browser_find(text | regex)` — Find elements by text

### Debug & Monitor
- `mcp_playwright_browser_console_messages(level?)` — Get console logs
- `mcp_playwright_browser_network_requests(filter?)` — Monitor network
- `mcp_playwright_browser_network_request(index, part?)` — Get request details
- `mcp_playwright_browser_evaluate(function)` — Run JavaScript

### Advanced
- `mcp_playwright_browser_wait_for(text | time)` — Wait for condition
- `mcp_playwright_browser_tabs(action)` — Manage browser tabs
- `mcp_playwright_browser_handle_dialog(accept, promptText?)` — Handle alerts/prompts
- `mcp_playwright_browser_file_upload(paths)` — Upload files
- `mcp_playwright_browser_run_code_unsafe(code)` — Run Playwright code

---

## How to Reference Elements

When using Playwright MCP, you can identify elements using:

### 1. **Element Reference (ref)**
From the snapshot, each element has a ref like `[ref=e27]`

```
Example:
  From snapshot: button "Something funny with Ryan Gosling" [ref=e27]
  Use in tools:   target: "e27"
```

### 2. **CSS Selector**
Standard CSS selectors work in most tools

```
Examples:
  "button:has-text('Click me')"
  "input[type='text']"
  ".recommendation-card"
```

### 3. **Text Search**
Use `mcp_playwright_browser_find()` to locate by text, then use the ref

```
Steps:
  1. Call mcp_playwright_browser_find with text
  2. Get back the snapshot with refs
  3. Use the ref in your next action
```

---

## Common Testing Patterns

### Pattern 1: Click & Wait for Content
```
1. Find element by text
2. Click it
3. Take snapshot to verify content loaded
4. Take screenshot to visualize
```

### Pattern 2: Form Submission
```
1. Find input field
2. Type text into it
3. Press Enter or click Submit
4. Wait for response/navigation
5. Verify results on page
```

### Pattern 3: Multi-step Navigation
```
1. Navigate to page
2. Click element A
3. Find element B (in new state)
4. Click element B
5. Verify final state
```

### Pattern 4: Visual Regression Testing
```
1. Perform action
2. Take screenshot
3. Store screenshot file path
4. Compare against baseline
```

---

## Tips for Using Playwright MCP

✅ **DO:**
- Use `find()` to locate elements, then reference the `ref`
- Take snapshots before interaction to understand page structure
- Use descriptive `element` parameter for permission prompts
- Check console messages for errors: `mcp_playwright_browser_console_messages("error")`
- Take screenshots at key points (before/after interactions)

❌ **DON'T:**
- Hardcode CSS selectors if you can use text search instead
- Forget to wait for elements to be visible after clicking
- Click elements without taking a snapshot first to find the right element
- Assume element refs stay the same if page content changes

---

## Next Steps

1. **Run the test file**: [backend/test-playwright-intro.ts](../backend/test-playwright-intro.ts)
2. **Try other interactions**: Form inputs, keyboard shortcuts, modal dialogs
3. **Test error states**: Invalid inputs, network errors, edge cases
4. **Automate workflows**: Multi-step user journeys, regression suites
5. **Extract data**: Use `evaluate()` to extract and validate page data

---

## Resources

- **Test file**: [backend/test-playwright-intro.ts](../backend/test-playwright-intro.ts) — Contains commented test cases for all key scenarios
- **App URL**: https://protogen-200.vercel.app/
- **Backend code**: [backend/src/](../backend/src/) — Recommendation engine and API endpoints
- **Frontend code**: [frontend/src/](../frontend/src/) — React components and UI logic
