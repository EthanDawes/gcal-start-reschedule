// Callback function to execute when mutations are observed
const callback = (mutationList, observer) => {
  for (const mutation of mutationList) {
    const handlesRemoved =
      mutation.type === "childList" &&
      mutation.removedNodes[0]?.className === "resched-top";
    const newCalEvents = mutation.type === "attributes";
    if (handlesRemoved || newCalEvents) {
      addHandles(mutation.target);
    }
  }
};

function addHandles(target) {
  const dragTarget = document.createElement("div");
  dragTarget.setAttribute("aria-hidden", "true");
  dragTarget.className = "resched-top";
  dragTarget.onmousedown = onDragStart;
  target.appendChild(dragTarget);
}

let dragStart; // mouse Y when drag start
let dragElem; // Event element that is being rescheduled
let dragEventOriginalDim; // Dimensions [top, height] of event element that is being dragged

function onDragStart(ev) {
  // Prevent dragging whole event
  ev.stopPropagation();
  // Prevent creating new events when mouse lifted
  document.documentElement.style.pointerEvents = "none";
  // Prevent showing current event details when releasing
  ev.target.style.pointerEvents = "none";

  console.log("drag start");
  dragStart = ev.pageY;
  dragElem = ev.target.parentElement;
  dragEventOriginalDim = [
    Number.parseInt(dragElem.style.top),
    Number.parseInt(dragElem.style.height),
  ];

  document.addEventListener("mousemove", onDragMove);
  window.addEventListener("mouseup", onDragEnd);
}

function roundTo(num, to) {
  return Math.round(num / to) * to;
}

// Returns top, height
function calcDragDimensions() {
  const minHeight = 11;
  const dragDiff = dragEnd - dragStart;
  const bottom = dragEventOriginalDim[0] + dragEventOriginalDim[1];
  return [
    Math.min(dragEventOriginalDim[0] + dragDiff, bottom - minHeight),
    Math.max(dragEventOriginalDim[1] - dragDiff, minHeight),
  ];
}

function onDragMove(ev) {
  console.log("move");
  dragEnd = ev.pageY;
  const [top, height] = calcDragDimensions();

  dragElem.style.top = top + "px";
  dragElem.style.height = height + "px";
}

async function onDragEnd(ev) {
  console.log("drag end");

  // Restore interactivity
  document.documentElement.style.pointerEvents = "";
  dragElem.querySelector(".resched-top").style.pointerEvents = "";
  document.removeEventListener("mousemove", onDragMove);
  window.removeEventListener("mouseup", onDragEnd);

  // Convert to minutes
  const [top, height] = calcDragDimensions();
  const pxToMin = 526 / (11 * 60);
  const newDurationMinutes = roundTo(height / pxToMin, 15);
  const startingOffsetMinutes = roundTo(
    (top - dragEventOriginalDim[0]) / pxToMin,
    15,
  );

  console.log("New duration (minutes):", newDurationMinutes);
  console.log("Starting offset (minutes):", startingOffsetMinutes);

  // Get calendar ID from the current URL or page context
  const [calendarId, dragEventId] = extractCalendarAndEventId(dragElem);
  console.log("Rescheduling", calendarId, dragEventId);

  if (dragEventId && calendarId) {
    try {
      // Send message to background script to reschedule the event
      const response = await chrome.runtime.sendMessage({
        action: "rescheduleEvent",
        data: {
          calendarId: calendarId,
          eventId: dragEventId,
          startingOffsetMinutes: startingOffsetMinutes,
          newDurationMinutes: newDurationMinutes,
        },
      });

      if (response.success) {
        console.log("Event successfully rescheduled:", response.data);
        // Optionally show a success message
        showNotification("Event rescheduled successfully!", "success");
        location.reload();
      } else {
        console.error("Failed to reschedule event:", response.error);
        showNotification(
          "Failed to reschedule event: " + response.error,
          "error",
        );
        // Revert the visual changes
        revertEventChanges();
      }
    } catch (error) {
      console.error("Error communicating with background script:", error);
      showNotification("Error rescheduling event. Please try again.", "error");
      revertEventChanges();
    }
  } else {
    console.error("Missing event ID or calendar ID");
    showNotification("Unable to identify event or calendar.", "error");
    revertEventChanges();
  }
}

// Helper function to get calendar ID from the current page. Returns [calendarId, eventId]
const extractCalendarAndEventId = (el) => {
  if (!el) return [null, null];

  const jslog = el.getAttribute("jslog") ?? "";

  const calendarId = jslog.match(/1:\["([^"]+)",\d\]/)?.[1] ?? null;

  const rawEventId = jslog.match(/2:\["([^"]+)"/)?.[1] ?? null;

  const eventId = rawEventId?.includes("_")
    ? rawEventId.split("_")[0]
    : (rawEventId ?? null);

  return [calendarId, eventId];
};

// Revert visual changes to the event element
function revertEventChanges() {
  if (dragElem && dragEventOriginalDim) {
    dragElem.style.top = dragEventOriginalDim[0] + "px";
    dragElem.style.height = dragEventOriginalDim[1] + "px";
  }
}

// Show notification to user
function showNotification(message, type = "info") {
  // Create notification element
  const notification = document.createElement("div");
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 12px 20px;
    border-radius: 4px;
    color: white;
    font-family: 'Google Sans', sans-serif;
    font-size: 14px;
    z-index: 10000;
    max-width: 300px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.2);
    ${
      type === "success"
        ? "background-color: #137333;"
        : type === "error"
          ? "background-color: #d93025;"
          : "background-color: #1976d2;"
    }
  `;

  document.body.appendChild(notification);

  // Remove notification after 5 seconds
  setTimeout(() => {
    if (notification.parentNode) {
      notification.parentNode.removeChild(notification);
    }
  }, 5000);
}

function init() {
  const config = {
    attributes: true,
    childList: true,
    subtree: true,
    attributeFilter: ["data-eventchip"],
  };

  const observer = new MutationObserver(callback);
  observer.observe(document.querySelector('[role="main"]'), config);

  document.querySelectorAll("[data-eventchip]").forEach(addHandles);
}

setTimeout(init, 1 * 1000);
