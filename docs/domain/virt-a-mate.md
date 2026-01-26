# Domain Knowledge: Virt-A-Mate (VaM) & .var Packages

## 📦 Package Structure (.var)
A `.var` file is a standard **ZIP archive** containing assets and metadata. It functions as a self-contained content unit.

### Key Files
-   `meta.json`: Root-level metadata file. Contains:
    -   `creatorName`: Creator name.
    -   `packageName`: Package name.
    -   `description`: Description.
    -   `contentList`: **Critical** list of all files in the package (used for quick scanning).
    -   `dependencies`: Map of dependent packages.
    -   `customOptions`: Preload scripts and settings.
-   `Saves/scene/*.json`: Scene definitions.
-   `Saves/person/appearance/*.vap`: Look presets.
-   `Custom/Clothing/...`: Clothing assets.

### Example `meta.json`
```json
{
   "licenseType" : "CC BY",
   "creatorName" : "TemplateCreator",
   "packageName" : "TemplatePackage",
   "standardReferenceVersionOption" : "Latest",
   "scriptReferenceVersionOption" : "Exact",
   "description" : "Generic description of the package content.",
   "credits" : "Credits to original authors...",
   "instructions" : "How to use this package...",
   "promotionalLink" : "https://hub.virtamate.com/resources/...",
   "programVersion" : "1.20.77.13",
   "contentList" : [
      "Custom/Atom/Person/Appearance/MyLook.vap",
      "Custom/Atom/Person/Appearance/MyLook.jpg",
      "Saves/scene/MyScene/Scene.json",
      "Saves/scene/MyScene/Scene.jpg",
      "Custom/Clothing/Female/MyTop/Top.vam",
      "Custom/Hair/Female/MyHair/Hair.vam",
      "Custom/Scripts/MyScript.cs"
   ],
   "dependencies" : {
      "VaM.Core.latest" : {
         "licenseType" : "CC BY-SA",
         "dependencies" : {}
      }
   },
   "customOptions" : {
      "preloadMorphs" : "false"
   }
}
```

## 🏷️ Categorization Logic
There are two distinct types of categorization in this domain:

### 1. Physical Categorization (VaM Native)
Determined strictly by **file path** and **extension**. This dictates where the content appears inside Virt-A-Mate (e.g., "Select Scene" browser).
*   **Scene:** `Saves/scene/*.json`
*   **Look:** `Saves/person/appearance/*.vap`
*   **Clothing:** `Custom/Clothing/*`
*   **Morph:** `Custom/Atom/Person/Morphs/*`

### 2. Logical Categorization (Hub / User)
Determined by **intent** (e.g., "Cosplay", "Toolkit", "Demo").
*   **Source:** Manually labeled on VaM Hub.
*   **Problem:** The `.var` `meta.json` standard does **NOT** include a standardized "Category" field.
*   **Strategy:** We must infer the Logical Category from the Physical structure (e.g., if it has `Saves/scene`, it's likely a "Scene" or "Room"), but allow user overrides since a "Scene" could be a "Toolkit" or "Comic".

## 🖼️ Thumbnail Extraction Logic (Refactored v1.3.11)
The thumbnail parser uses a **"Weighted Sibling Rule"** to identify the most relevant image.

### Priority Hierarchy (Highest to Lowest)
1.  **Meta Image** (`meta.json` -> `imageUrl` field).
    *   *Why:* Explicitly defined by the creator as the package cover.
2.  **Package Cover** (`package.jpg` or `package.png`).
    *   *Why:* Standard VaM Hub convention.
3.  **Content Siblings** (Weighted by Content Type):
    *   *Logic:* An image is a valid thumbnail **only if** it shares a basename with a valid content file (e.g., `MyScene.json` -> `MyScene.jpg`).
    *   **Priority 4 (High):** Scenes (`.json`) and Looks (`.vap` in appearance folder).
    *   **Priority 3 (Medium):** Clothing (`.vam`, `.vap`), Hair (`.vam`, `.vap`).
    *   **Priority 2 (Low):** Assets (`.assetbundle`), Morphs (`.vmi`), Scripts (`.cs`).
    *   **Priority 0 (Ignored):** Textures (`/textures/`, `/assets/`) without a content sibling.

### Tie-Breaker Logic
If multiple candidates share the same highest priority (e.g., two Scenes in one package):
*   **Rule:** **Alphabetical Order (A-Z)**.
*   *Why:* Matches the visual order in the "Contents" list. The first item listed (and its image) represents the package.
*   *Legacy:* Previously used File Size (removed in v1.3.11).

### Texture Filtering
*   Images residing in `/textures/` or `/assets/` are **explicitly ignored** unless they have a direct content sibling (e.g., a `.vmi` morph file). This prevents random texture maps (diffuse, normal) from being selected as the thumbnail.

## 🏷️ Official VaM Hub Categories
> **Note:** These are categories used on [hub.virtamate.com](https://hub.virtamate.com/). VaM itself does not strictly enforce these; they are often manually labeled by creators during upload.

-   **Scenes:** Playable content and scenes.
-   **Looks:** Character models and appearance presets.
-   **Clothing:** Clothing items and presets.
-   **Hairstyles:** Hairstyles and hair presets.
-   **Morphs:** Body shapes and expressions.
-   **Poses:** Static poses, idle animations.
-   **Mocap + Animation:** Motion capture, dances.
-   **Textures:** Skins, overlays, tattoos.
-   **Environments:** Buildings, rooms, stages.
-   **Lighting + HDRI:** Light rigs, LUTs, skyboxes.
-   **Assets + Accessories:** Custom Unity Assets.
-   **Audio:** Music, voice, sound effects.
-   **Plugins + Scripts:** Script-based tools and apps.
-   **Toolkits + Templates:** Utility scenes, guides.
-   **Comics + Storytelling:** 2D comics, video stories.
-   **Voxta Scenes:** AI-enhanced content.
-   **Demo + Lite:** Samples.
-   **Guides:** Instructions.
-   **Other:** Miscellaneous.

### 3. "Plugin" vs "Script"
-   **Clarification:** "Plugin" and "Script" are effectively the same category in VaM ("Plugins + Scripts").
-   **Identification:** They are script-based tools/apps. The distinction is largely semantic or based on usage (tool vs. scene automation), but technically they are `.cs` files.
