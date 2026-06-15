#target illustrator

(function () {
  if (app.documents.length === 0) {
    alert("Open an Illustrator document before running this script.");
    return;
  }

  var payloadFile = File.openDialog(
    "Choose the certificate payload JSON exported from the web app",
    "*.json"
  );

  if (!payloadFile) {
    return;
  }

  var payload = readPayload(payloadFile);
  if (!payload) {
    return;
  }

  var doc = app.activeDocument;
  var result = applyPayload(doc, payload);
  alert(buildSummary(result));

  function readPayload(file) {
    if (!file.open("r")) {
      alert("Could not open payload file:\n" + file.fsName);
      return null;
    }

    var raw = file.read();
    file.close();

    try {
      if (typeof JSON !== "undefined" && JSON.parse) {
        return JSON.parse(raw);
      }
      return eval("(" + raw + ")");
    } catch (error) {
      alert("Payload JSON could not be parsed.\n\n" + error);
      return null;
    }
  }

  function applyPayload(documentRef, payloadRef) {
    var textApplied = [];
    var textMissing = [];
    var imageApplied = [];
    var imageMissing = [];
    var imageErrors = [];

    if (payloadRef.textFrames) {
      for (var textName in payloadRef.textFrames) {
        if (!payloadRef.textFrames.hasOwnProperty(textName)) {
          continue;
        }

        var textValue = payloadRef.textFrames[textName];
        var textMatches = findNamedItems(documentRef.textFrames, textName);

        if (textMatches.length === 0) {
          textMissing.push(textName);
          continue;
        }

        for (var i = 0; i < textMatches.length; i++) {
          updateTextFrame(textMatches[i], textValue);
        }

        textApplied.push(textName + " (" + textMatches.length + ")");
      }
    }

    if (payloadRef.placedItems) {
      for (var imageName in payloadRef.placedItems) {
        if (!payloadRef.placedItems.hasOwnProperty(imageName)) {
          continue;
        }

        var imagePath = payloadRef.placedItems[imageName];
        if (!imagePath) {
          continue;
        }

        var imageMatches = findNamedItems(documentRef.placedItems, imageName);
        if (imageMatches.length === 0) {
          imageMissing.push(imageName);
          continue;
        }

        var linkFile = new File(imagePath);
        if (!linkFile.exists) {
          imageErrors.push(imageName + " -> file not found: " + imagePath);
          continue;
        }

        for (var j = 0; j < imageMatches.length; j++) {
          relinkPlacedItem(imageMatches[j], linkFile);
        }

        imageApplied.push(imageName + " (" + imageMatches.length + ")");
      }
    }

    return {
      textApplied: textApplied,
      textMissing: textMissing,
      imageApplied: imageApplied,
      imageMissing: imageMissing,
      imageErrors: imageErrors
    };
  }

  function findNamedItems(collection, itemName) {
    var matches = [];
    for (var i = 0; i < collection.length; i++) {
      if (collection[i].name === itemName) {
        matches.push(collection[i]);
      }
    }
    return matches;
  }

  function updateTextFrame(textFrame, value) {
    withEditableItem(textFrame, function () {
      textFrame.contents = String(value);
    });
  }

  function relinkPlacedItem(placedItem, linkFile) {
    withEditableItem(placedItem, function () {
      placedItem.relink(linkFile);
    });
  }

  function withEditableItem(item, fn) {
    var wasLocked = false;
    var wasHidden = false;

    try {
      wasLocked = item.locked;
      wasHidden = item.hidden;
    } catch (error) {}

    try {
      if (wasLocked) {
        item.locked = false;
      }
      if (wasHidden) {
        item.hidden = false;
      }
      fn();
    } finally {
      try {
        item.hidden = wasHidden;
      } catch (errorHidden) {}

      try {
        item.locked = wasLocked;
      } catch (errorLocked) {}
    }
  }

  function buildSummary(result) {
    var lines = [];

    lines.push("Illustrator certificate payload applied.");
    lines.push("");
    lines.push("Text updated: " + result.textApplied.length);
    if (result.textApplied.length > 0) {
      lines.push(result.textApplied.join(", "));
    }

    lines.push("");
    lines.push("Images relinked: " + result.imageApplied.length);
    if (result.imageApplied.length > 0) {
      lines.push(result.imageApplied.join(", "));
    }

    if (result.textMissing.length > 0) {
      lines.push("");
      lines.push("Missing text frame names:");
      lines.push(result.textMissing.join(", "));
    }

    if (result.imageMissing.length > 0) {
      lines.push("");
      lines.push("Missing placed item names:");
      lines.push(result.imageMissing.join(", "));
    }

    if (result.imageErrors.length > 0) {
      lines.push("");
      lines.push("Image relink errors:");
      lines.push(result.imageErrors.join("\n"));
    }

    lines.push("");
    lines.push("Review the document in Illustrator, then save it when ready.");
    return lines.join("\n");
  }
})();
