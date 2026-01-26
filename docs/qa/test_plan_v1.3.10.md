# Test Plan: v1.3.10 UX & Logic Hardening

> **Objective:** Verify the specific UX improvements and Status Logic fixes delivered in v1.3.10.

## 1. UX & Mobile Responsive
### TC-01: Mobile Pagination
| Step | Action | Expected Result | Pass/Fail |
| :--- | :--- | :--- | :--- |
| 1 | **Resize Window** | Resize browser/app window to a mobile aspect ratio (e.g. 375x667). | [ ] |
| 2 | **Scroll to Bottom** | Scroll through the package grid to the very bottom. | [ ] |
| 3 | **Verify Footer** | The Pagination Bar (Previous/Next) should be **visible** and sticky at the bottom. It should NOT be obscured by the window edge. | [ ] |
| 4 | **Verify Padding** | The last row of cards should use the new `pb-32` padding, extending clearly *above* the footer so no content is hidden behind it. | [ ] |

### TC-02: Library Access Error Banner
| Step | Action | Expected Result | Pass/Fail |
| :--- | :--- | :--- | :--- |
| 1 | **Mock Failure** | *Optional*: Temporarily rename a library folder on disk so YAVAM can't find it. | [ ] |
| 2 | **Scan/Load** | Try to load that library in the app. | [ ] |
| 3 | **Verify Banner** | A red **"Library Access Error"** banner should appear at the top of the grid with a friendly message. | [ ] |

## 2. Install & Navigation
### TC-03: Install Flow Navigation
| Step | Action | Expected Result | Pass/Fail |
| :--- | :--- | :--- | :--- |
| 1 | **Open Install Modal** | Select a package in "Downloads" and click Install. | [ ] |
| 2 | **Target Different Lib** | Choose a target library that is **NOT** the currently active one. | [ ] |
| 3 | **Install** | Click "Install Packages" and wait for completion. | [ ] |
| 4 | **Click "View Library"** | Click the new **"View Library"** button in the success footer. | [ ] |
| 5 | **Verify Action** | App should: **1.** Close Modal. **2.** Switch active library. **3.** Automatically start a **Scan** to show the new file. | [ ] |

### TC-04: Creator Filter Toggle
| Step | Action | Expected Result | Pass/Fail |
| :--- | :--- | :--- | :--- |
| 1 | **Filter by Creator** | Click on a Creator Name in the details sidebar | Dashboard filters to show only that creator. Creator Pill in sidebar becomes Active (Colored). | [ ] |
| 2 | **Toggle Off** | Click the **Same Creator Pill** again. | [ ] |
| 3 | **Verify Reset** | Filter clears. Dashboard shows "All Packages". | [ ] |

## 3. Status Logic Hardening
### TC-05: Status Priorities
| Step | Action | Expected Result | Pass/Fail |
| :--- | :--- | :--- | :--- |
| 1 | **Find Disabled Package** | Find a package that you have disabled (or disable one). | [ ] |
| 2 | **Verify Status** | Status should be **Gray (DISABLED)**. It should NOT be Yellow (Obsolete) or Purple (Duplicate), even if it is technically older/duplicate. Disabled takes priority. | [ ] |

### TC-06: Obsoleted By Inspector
| Step | Action | Expected Result | Pass/Fail |
| :--- | :--- | :--- | :--- |
| 1 | **Find Obsolete Package** | Find a package marked **Yellow (OBSOLETE)**. | [ ] |
| 2 | **Open Details** | Click to open the Right Sidebar. | [ ] |
| 3 | **Check Inspector** | Look for the "Status" badge. It should have a small **(i)** icon or text saying "Obsoleted by: [Package vX.X]". | [ ] |
