import {
  checkRadius,
  newCheckStrokes,
  checkType,
  newCheckFills,
  newCheckEffects,
  determineFill,
  gradientToCSS
  // customCheckTextFills,
  // uncomment this as an example of a custom lint function ^
} from "./lintingFunctions";
import { fetchRemoteStyles, groupLibrary } from "./remoteStyleFunctions";

const {
  getLocalPaintStyles,
  getLocalTextStyles,
  getLocalEffectStyles
} = require("./styles");

figma.showUI(__html__, { width: 360, height: 580 });

let borderRadiusArray = [0, 2, 4, 8, 16, 24, 32];
let originalNodeTree: readonly any[] = [];
let lintVectors = false;
let localStylesLibrary = {};

// Styles used in our page
let usedRemoteStyles = {
  name: "Remote Styles",
  fills: [],
  strokes: [],
  text: [],
  effects: []
};

// Variables object we'll use for storing all the variables
// found in our page.
let variablesInUse = {
  name: "Variables",
  variables: []
};

let colorVariables;
let numbervariables;
let variablesWithGroupedConsumers;

figma.skipInvisibleInstanceChildren = true;

// Function to generate a UUID
// This way we can store ignored errors per document rather than
// sharing ignored errors across all documents.
function generateUUID() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function(c) {
    var r = (Math.random() * 16) | 0,
      v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function getDocumentUUID() {
  // Try to get the UUID from the document's plugin data
  let uuid = figma.root.getPluginData("documentUUID");

  // If the UUID does not exist (empty string), generate a new one and store it
  if (!uuid) {
    uuid = generateUUID();
    figma.root.setPluginData("documentUUID", uuid);
  }

  return uuid;
}

// Set the unique ID we use for client storage.
const documentUUID = getDocumentUUID();

figma.on("documentchange", _event => {
  // When a change happens in the document
  // send a message to the plugin to look for changes.
  figma.ui.postMessage({
    type: "change"
  });
});

figma.ui.onmessage = msg => {
  if (msg.type === "close") {
    figma.closePlugin();
  }

  if (msg.type === "step-2") {
    let layer = figma.getNodeById(msg.id);
    let layerArray = [];

    // Using figma UI selection and scroll to viewport requires an array.
    layerArray.push(layer);

    // Moves the layer into focus and selects so the user can update it.
    figma.currentPage.selection = layerArray;
    figma.viewport.scrollAndZoomIntoView(layerArray);

    let layerData = JSON.stringify(layer, [
      "id",
      "name",
      "description",
      "fills",
      "key",
      "type",
      "remote",
      "paints",
      "fontName",
      "fontSize",
      "font"
    ]);

    figma.ui.postMessage({
      type: "step-2-complete",
      message: layerData
    });
  }

  // Fetch a specific node by ID.
  if (msg.type === "fetch-layer-data") {
    let layer = figma.getNodeById(msg.id);
    let layerArray = [];

    // Using figma UI selection and scroll to viewport requires an array.
    layerArray.push(layer);

    // Moves the layer into focus and selects so the user can update it.
    figma.currentPage.selection = layerArray;
    figma.viewport.scrollAndZoomIntoView(layerArray);

    let layerData = JSON.stringify(layer, [
      "id",
      "name",
      "description",
      "fills",
      "key",
      "type",
      "remote",
      "paints",
      "fontName",
      "fontSize",
      "font"
    ]);

    figma.ui.postMessage({
      type: "fetched layer",
      message: layerData
    });
  }

  // Called when an update in the Figma file happens
  // so we can check what changed.
  if (msg.type === "update-errors") {
    figma.ui.postMessage({
      type: "updated errors",
      errors: lint(originalNodeTree, msg.libraries)
    });
  }

  // Used only to update the styles page when its selected.
  async function handleUpdateStylesPage() {
    const resetRemoteStyles = {
      name: "Remote Styles",
      fills: [],
      strokes: [],
      text: [],
      effects: []
    };

    await fetchRemoteStyles(resetRemoteStyles);

    const libraryWithGroupedConsumers = groupLibrary(resetRemoteStyles);

    libraryWithGroupedConsumers.fills.sort((a, b) =>
      a.name.localeCompare(b.name)
    );
    libraryWithGroupedConsumers.text.sort((a, b) =>
      a.name.localeCompare(b.name)
    );
    libraryWithGroupedConsumers.strokes.sort((a, b) =>
      a.name.localeCompare(b.name)
    );
    libraryWithGroupedConsumers.effects.sort((a, b) =>
      a.name.localeCompare(b.name)
    );

    figma.ui.postMessage({
      type: "remote-styles-imported",
      message: libraryWithGroupedConsumers
    });
  }

  // Updates all the styles listed on the styles page.
  if (msg.type === "update-styles-page") {
    handleUpdateStylesPage();
  }

  // Notify the user of an issue.
  if (msg.type === "notify-user") {
    figma.notify(msg.message, { timeout: 1000 });
  }

  // Updates client storage with a new ignored error
  // when the user selects "ignore" from the context menu
  if (msg.type === "update-storage") {
    let arrayToBeStored = JSON.stringify(msg.storageArray);
    figma.clientStorage.setAsync(documentUUID, arrayToBeStored);
  }

  // Clears all ignored errors
  // invoked from the settings menu
  if (msg.type === "update-storage-from-settings") {
    let arrayToBeStored = JSON.stringify(msg.storageArray);
    figma.clientStorage.setAsync(documentUUID, arrayToBeStored);

    figma.ui.postMessage({
      type: "reset storage",
      storage: arrayToBeStored
    });

    figma.notify("Cleared ignored errors", { timeout: 1000 });
  }

  // Remembers the last tab selected in the UI and sets it
  // to be active (layers vs error by category view)
  if (msg.type === "update-active-page-in-settings") {
    let pageToBeStored = JSON.stringify(msg.page);
    figma.clientStorage.setAsync("storedActivePage", pageToBeStored);
  }

  // Changes the linting rules, invoked from the settings menu
  if (msg.type === "update-lint-rules-from-settings") {
    lintVectors = msg.boolean;
  }

  // For when the user updates the border radius values to lint from the settings menu.
  if (msg.type === "update-border-radius") {
    let newRadiusArray = null;

    if (typeof msg.radiusValues === "string") {
      let newString = msg.radiusValues.replace(/\s+/g, "");
      newRadiusArray = newString.split(",");
      newRadiusArray = newRadiusArray
        .filter(x => x.trim().length && !isNaN(x))
        .map(Number);

      // Most users won't add 0 to the array of border radius so let's add it in for them.
      if (newRadiusArray.indexOf(0) === -1) {
        newRadiusArray.unshift(0);
      }
    } else {
      newRadiusArray = msg.radiusValues;
    }

    // Update the array we pass into checkRadius for linting.
    newRadiusArray = newRadiusArray.sort((a, b) => a - b);
    borderRadiusArray = newRadiusArray;

    // Save this value in client storage.
    let radiusToBeStored = JSON.stringify(borderRadiusArray);
    figma.clientStorage.setAsync("storedRadiusValues", radiusToBeStored);

    figma.ui.postMessage({
      type: "fetched border radius",
      storage: JSON.stringify(borderRadiusArray)
    });

    figma.notify("Saved border radius, this can be changed in settings", {
      timeout: 1500
    });
  }

  if (msg.type === "reset-border-radius") {
    borderRadiusArray = [0, 2, 4, 8, 16, 24, 32];
    figma.clientStorage.setAsync("storedRadiusValues", []);

    figma.ui.postMessage({
      type: "fetched border radius",
      storage: JSON.stringify(borderRadiusArray)
    });

    figma.notify("Reset border radius value", { timeout: 1000 });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // REMOVED: apply-styles, create-style handlers and all associated helpers
  // (isStyleKeyLocal, isStyleInUse, applyLocalStyle, applyRemoteStyle,
  //  createPaintStyleFromNode, createStrokeStyleFromNode,
  //  createEffectStyleFromNode, createTextStyleFromNode,
  //  roundToDecimalPlaces)
  // ─────────────────────────────────────────────────────────────────────────

  if (msg.type === "select-multiple-layers") {
    const layerArray = msg.nodeArray;
    let nodesToBeSelected = [];

    layerArray.forEach(item => {
      let layer = figma.getNodeById(item);
      // Using selection and viewport requires an array.
      nodesToBeSelected.push(layer);
    });

    // Moves the layer into focus and selects so the user can update it.
    figma.currentPage.selection = nodesToBeSelected;
    figma.viewport.scrollAndZoomIntoView(nodesToBeSelected);
    figma.notify(`${nodesToBeSelected.length} layers selected`, {
      timeout: 750
    });
  }

  // Serialize nodes to pass back to the UI.
  function serializeNodes(nodes) {
    let serializedNodes = JSON.stringify(nodes, [
      "name",
      "type",
      "children",
      "id"
    ]);

    return serializedNodes;
  }

  function lint(nodes, libraries, lockedParentNode = false) {
    let errorArray = [];

    // Use a for loop instead of forEach
    for (const node of nodes) {
      // Determine if the layer or its parent is locked.
      const isLayerLocked = lockedParentNode || node.locked;
      const nodeChildren = node.children;

      // Create a new object.
      const newObject = {
        id: node.id,
        errors: isLayerLocked ? [] : determineType(node, libraries),
        children: []
      };

      // Check if the node has children.
      if (nodeChildren) {
        // Recursively run this function to flatten out children and grandchildren nodes.
        newObject.children = node.children.map(childNode => childNode.id);
        errorArray.push(...lint(node.children, libraries, isLayerLocked));
      }

      errorArray.push(newObject);
    }

    return errorArray;
  }

  function delay(time) {
    return new Promise(resolve => setTimeout(resolve, time));
  }

  // Counter to keep track of the total number of processed nodes
  let nodeCounter = 0;

  async function* lintAsync(nodes, libraries, lockedParentNode = false) {
    let errorArray = [];

    for (const node of nodes) {
      // Determine if the layer or its parent is locked.
      const isLayerLocked = lockedParentNode || node.locked;

      // Create a new object.
      const newObject = {
        id: node.id,
        errors: isLayerLocked ? [] : determineType(node, libraries),
        children: []
      };

      // Check if the node has children.
      if (node.children) {
        // Recursively run this function to flatten out children and grandchildren nodes.
        newObject.children = node.children.map(childNode => childNode.id);

        for await (const result of lintAsync(
          node.children,
          libraries,
          isLayerLocked
        )) {
          errorArray.push(...result);
        }
      }

      errorArray.push(newObject);

      // Increment the node counter, this is our number of layers total.
      nodeCounter++;

      // Yield the result after processing a certain number of nodes
      if (nodeCounter % 1000 === 0) {
        yield errorArray;
        errorArray = [];
        await delay(5);
      }
    }

    // Yield any remaining results
    if (errorArray.length > 0) {
      yield errorArray;
    }
  }

  if (msg.type === "step-3") {
    // Use an async function to handle the asynchronous generator
    async function processLint() {
      const finalResult = [];

      for await (const result of lintAsync(originalNodeTree, msg.libraries)) {
        finalResult.push(...result);
      }

      // Pass the final result back to the UI to be displayed.
      figma.ui.postMessage({
        type: "step-3-complete",
        errors: finalResult,
        message: serializeNodes(originalNodeTree)
      });
    }

    // Start the lint process
    figma.notify(`Design Lint is running and automatically detect changes`, {
      timeout: 1500
    });

    processLint();
  }

  // Import local styles to use as recommendations
  // This function doesn't save the styles, that's "save-library"
  if (msg.type === "find-local-styles") {
    (async function() {
      const paintStylesData = await getLocalPaintStyles();
      const textStylesData = await getLocalTextStyles();
      const effectStylesData = await getLocalEffectStyles();

      const fileName = figma.root.name;
      const totalStyles =
        effectStylesData.length +
        textStylesData.length +
        paintStylesData.length;

      const localStyles = {
        name: fileName,
        effects: effectStylesData,
        fills: paintStylesData,
        text: textStylesData,
        styles: totalStyles
      };

      // Send the updated libraries array to the UI layer
      figma.ui.postMessage({
        type: "local-styles-imported",
        message: localStyles
      });
    })();
  }

  // Saves local styles as a library to use in every file.
  if (msg.type === "save-library") {
    (async function() {
      const paintStylesData = await getLocalPaintStyles();
      const textStylesData = await getLocalTextStyles();
      const effectStylesData = await getLocalEffectStyles();

      const fileName = figma.root.name;
      const totalStyles =
        effectStylesData.length +
        textStylesData.length +
        paintStylesData.length;

      const key = "libraryKey";
      const library = {
        name: fileName,
        effects: effectStylesData,
        fills: paintStylesData,
        text: textStylesData,
        styles: totalStyles
      };

      // Fetch the stored libraries from client storage
      const storedLibraries = (await figma.clientStorage.getAsync(key)) || [];

      // Check if a library with the same name already exists in the libraries array
      const existingLibraryIndex = storedLibraries.findIndex(
        storedLibrary => storedLibrary.name === library.name
      );

      if (existingLibraryIndex !== -1) {
        // If the library exists, update the existing library
        storedLibraries[existingLibraryIndex] = library;
      } else {
        // If the library doesn't exist, add it to the libraries array
        storedLibraries.push(library);
      }

      // Save the updated libraries array to client storage
      await figma.clientStorage.setAsync(key, storedLibraries);

      // Send the updated libraries array to the UI layer
      figma.ui.postMessage({
        type: "library-imported",
        message: storedLibraries
      });
    })();
  }

  if (msg.type === "remove-library") {
    figma.clientStorage.setAsync("libraryKey", msg.storageArray);
  }

  // Initialize the app
  if (msg.type === "run-app") {
    if (figma.currentPage.selection.length === 0 && msg.selection === "user") {
      figma.notify(`Select some layers, then try running again!`, {
        timeout: 2000
      });

      // If the user hasn't selected anything, show the empty state.
      figma.ui.postMessage({
        type: "show-empty-state"
      });

      return;
    } else {
      let nodes = null;
      let firstNode = [];

      // Determine whether we scan the page for the user,
      // or use their selection
      if (msg.selection === "user") {
        nodes = figma.currentPage.selection;
        firstNode.push(figma.currentPage.selection[0]);
      } else if (msg.selection === "page") {
        nodes = figma.currentPage.children;
        firstNode.push(nodes[0]);
      }

      // Maintain the original tree structure so we can enable
      // refreshing the tree and live updating errors.
      originalNodeTree = nodes;

      // Show the preloader until we're ready to render content.
      figma.ui.postMessage({
        type: "show-preloader"
      });

      // Fetch the ignored errors and libraries from client storage
      const ignoredErrorsPromise = figma.clientStorage.getAsync(documentUUID);
      const librariesPromise = figma.clientStorage.getAsync("libraryKey");

      Promise.all([ignoredErrorsPromise, librariesPromise]).then(
        async ([ignoredErrors, libraries]) => {
          if (ignoredErrors && ignoredErrors.length) {
            figma.ui.postMessage({
              type: "fetched storage",
              storage: ignoredErrors
            });
          }

          if (libraries && libraries.length) {
            figma.ui.postMessage({
              type: "library-imported-from-storage",
              message: libraries
            });
          }

          async function findRemoteStyles() {
            const currentPage = figma.currentPage;
            const nodes = currentPage
              .findAllWithCriteria({
                types: [
                  "TEXT",
                  "FRAME",
                  "COMPONENT",
                  "RECTANGLE",
                  "ELLIPSE",
                  "INSTANCE",
                  "VECTOR",
                  "LINE"
                ]
              })
              .filter(node => {
                // Check for remote styles
                return (
                  node.fillStyleId ||
                  node.strokeStyleId ||
                  (node.type === "TEXT" && node.textStyleId) ||
                  node.effectStyleId
                );
              });

            for (const node of nodes) {
              if (node.fillStyleId) {
                const styleId = node.fillStyleId;

                if (typeof styleId !== "symbol") {
                  const existingStyle = usedRemoteStyles.fills.find(
                    style => style.id === styleId
                  );

                  if (existingStyle) {
                    existingStyle.count += 1;
                    existingStyle.consumers.push(node);
                  } else {
                    const style = figma.getStyleById(styleId);

                    if (style === null) {
                      return;
                    }

                    let currentFill = determineFill(node.fills);
                    let nodeFillType = node.fills[0].type;
                    let cssSyntax = null;

                    if (nodeFillType === "SOLID") {
                      cssSyntax = currentFill;
                    } else if (
                      nodeFillType !== "SOLID" &&
                      nodeFillType !== "VIDEO" &&
                      nodeFillType !== "IMAGE"
                    ) {
                      cssSyntax = gradientToCSS(node.fills[0]);
                    }

                    usedRemoteStyles.fills.push({
                      id: node.fillStyleId,
                      type: "fill",
                      paint: style.paints[0],
                      name: style.name,
                      count: 1,
                      consumers: [node],
                      fillColor: cssSyntax
                    });
                  }
                }
              }

              if (node.strokeStyleId) {
                const styleId = node.strokeStyleId;

                if (typeof styleId !== "symbol") {
                  const existingStyle = usedRemoteStyles.strokes.find(
                    style => style.id === styleId
                  );

                  if (existingStyle) {
                    existingStyle.count += 1;
                    existingStyle.consumers.push(node);
                  } else {
                    const style = figma.getStyleById(styleId);
                    let nodeFillType = style.paints[0].type;
                    let cssSyntax = null;

                    if (nodeFillType === "SOLID") {
                      cssSyntax = determineFill(style.paints);
                    } else if (
                      nodeFillType !== "IMAGE" &&
                      nodeFillType !== "VIDEO"
                    ) {
                      cssSyntax = gradientToCSS(node.strokes[0]);
                    }

                    usedRemoteStyles.strokes.push({
                      id: node.strokeStyleId,
                      type: "stroke",
                      paint: style.paints[0],
                      name: style.name,
                      count: 1,
                      consumers: [node],
                      fillColor: cssSyntax
                    });
                  }
                }
              }
            }
          }

          await findRemoteStyles();

          // Fetch the active page from storage
          const storedActivePage = await figma.clientStorage.getAsync(
            "storedActivePage"
          );
          if (storedActivePage) {
            figma.ui.postMessage({
              type: "fetched active page",
              storage: storedActivePage
            });
          }

          // Fetch border radius values from storage
          const storedRadius = await figma.clientStorage.getAsync(
            "storedRadiusValues"
          );
          if (storedRadius && storedRadius.length) {
            borderRadiusArray = storedRadius;
            figma.ui.postMessage({
              type: "fetched border radius",
              storage: JSON.stringify(borderRadiusArray)
            });
          }

          figma.ui.postMessage({
            type: "step-1",
            message: serializeNodes(firstNode),
            errors: lint(firstNode, libraries || [])
          });
        }
      );
    }
  }
};

// ─── Linting Logic (unchanged) ───────────────────────────────────────────────

function determineType(node, libraries = []) {
  switch (node.type) {
    case "SLICE":
    case "GROUP": {
      // Groups styles apply to their children so we can skip this node type.
      let errors = [];
      return errors;
    }
    case "CIRCLE":
    case "VECTOR":
    case "STAR":
    case "BOOLEAN_OPERATION":
    case "SQUARE": {
      return lintShapeRules(node, libraries);
    }
    case "FRAME": {
      return lintFrameRules(node, libraries);
    }
    case "INSTANCE":
    case "RECTANGLE": {
      return lintRectangleRules(node, libraries);
    }
    case "COMPONENT": {
      return lintComponentRules(node, libraries);
    }
    case "TEXT": {
      return lintTextRules(node, libraries);
    }
    case "LINE": {
      return lintLineRules(node, libraries);
    }
    default: {
      // Do nothing
    }
  }
}

function lintShapeRules(node, libraries) {
  let errors = [];

  if (lintVectors) {
    newCheckFills(node, errors, libraries);
    newCheckStrokes(node, errors, libraries);
    newCheckEffects(node, errors, libraries);
  }

  return errors;
}

function lintFrameRules(node, libraries) {
  let errors = [];

  newCheckFills(node, errors, libraries);
  newCheckStrokes(node, errors, libraries);
  newCheckEffects(node, errors, libraries);
  checkRadius(node, errors, borderRadiusArray);

  return errors;
}

function lintRectangleRules(node, libraries) {
  let errors = [];

  newCheckFills(node, errors, libraries);
  newCheckStrokes(node, errors, libraries);
  newCheckEffects(node, errors, libraries);
  checkRadius(node, errors, borderRadiusArray);

  return errors;
}

function lintComponentRules(node, libraries) {
  let errors = [];

  newCheckFills(node, errors, libraries);
  newCheckStrokes(node, errors, libraries);
  newCheckEffects(node, errors, libraries);
  checkRadius(node, errors, borderRadiusArray);

  return errors;
}

function lintTextRules(node, libraries) {
  let errors = [];

  checkType(node, errors, libraries);
  newCheckFills(node, errors, libraries);
  newCheckEffects(node, errors, libraries);
  newCheckStrokes(node, errors, libraries);

  return errors;
}

function lintLineRules(node, libraries) {
  let errors = [];

  newCheckStrokes(node, errors, libraries);
  newCheckEffects(node, errors, libraries);

  return errors;
}
