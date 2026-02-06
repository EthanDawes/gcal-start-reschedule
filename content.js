// Callback function to execute when mutations are observed
const onMutation = (mutationList, observer) => {
  for (const mutation of mutationList) {
    const handlesRemoved =
      mutation.type === "childList" &&
      mutation.removedNodes[0]?.className === "resched-top";
    const newCalEvents =
      mutation.type === "attributes" &&
      mutation.attributeName === "data-eventchip";
    // Observing creation of nodes with attr `data-eventchip` seems to have no effect
    if (handlesRemoved || newCalEvents) {
      console.log(
        "Restoring handles because",
        handlesRemoved ? "removed" : "data-eventchip attr modified",
      );
      addHandles(mutation.target);
      continue;
    }

    // Observe when "copy to calendar" buttons added to DOM
    // There's seemingly no event when `li[role=menuitem]` is added, listening more broadly
    // TODO: debounce
    if (
      mutation.target instanceof HTMLUListElement &&
      mutation.addedNodes.length
    ) {
      console.log("Menu items added", mutation.target);
      addMoveCopyBtns(mutation.target.querySelectorAll("[data-eventid]")); // TODO: this ignores the regular "duplicate" button
    }
  }
};

// Despite the name, `buttons` are actualy `li` elements
function addMoveCopyBtns(buttons) {
  const internalId = buttons[0].getAttribute("data-eventid");
  const eventElement = document.querySelector(
    `[data-eventid="${internalId}"][jslog]`,
  );
  const [calendarId, eventId] = extractCalendarAndEventId(eventElement);

  document.addEventListener(
    "click",
    (ev) => {
      //if (!(ev.target instanceof HTMLLIElement)) return;
      const dstCal = atob(ev.target.dataset.id);
      ev.stopImmediatePropagation();
      ev.preventDefault();
      ev.stopPropagation();
      onCopyClick(calendarId, eventId, dstCal);
    },
    { capture: true, once: true },
  );
}

async function onCopyClick(calendarId, eventId, dstCal) {
  const mode = (
    prompt(
      "Would you like to move or copy, 1 or all? Options: copy 1, copy all, move 1, move all. all/1 will have no effect on non-repeating events and can be omitted",
      "copy all",
    ) ?? ""
  ).split(" ");
  const verb = mode[0];
  const quantity = mode[1] || "all";
  if (
    (verb != "copy" && verb != "move") ||
    (quantity != "1" && quantity != "all")
  ) {
    alert("Unknown command. Proceeding with regular copy action");
    return;
  }

  if (quantity === "1") {
    // Use the API to fetch the event details for that instance
    try {
      const getResponse = await chrome.runtime.sendMessage({
        action: "getEvent",
        data: { calendarId, eventId },
      });

      // debugger;
      if (getResponse.success) {
        // Create a new event using the API (copy of the particular instance) on the correct destination calendar
        const createResponse = await chrome.runtime.sendMessage({
          action: "createEvent",
          data: {
            calendarId: dstCal,
            eventData: getResponse.data,
          },
        });
        // debugger;

        if (createResponse.success) {
          // Open it for editing using this URL and the event id returned in the response
          const internalId = createResponse.data.htmlLink.split("=")[1];
          const editUrl =
            "https://calendar.google.com/calendar/u/0/r/eventedit/" +
            internalId;

          location.assign(editUrl);

          if (verb === "move") {
            // Use the API to delete the one instance
            const deleteResponse = await chrome.runtime.sendMessage({
              action: "deleteEvent",
              data: { calendarId, eventId },
            });

            if (deleteResponse.success) {
              showNotification("Event moved successfully!", "success");
              location.reload();
            } else {
              showNotification(
                "Failed to delete original event: " + deleteResponse.error,
                "error",
              );
            }
          } else {
            showNotification("Event copied! Check the new tab.", "success");
          }
        } else {
          showNotification(
            "Failed to create new event: " + createResponse.error,
            "error",
          );
          return;
        }
      } else {
        showNotification(
          "Failed to fetch event details: " + getResponse.error,
          "error",
        );
        return;
      }
    } catch (error) {
      showNotification("Error copying event: " + error.message, "error");
      return;
    }
  } else {
    // all
    if (verb === "move") {
      // show the "copy event" dialogue, as usual
      // Allow the default copy action to proceed

      // In the background, use the API to delete the event series
      // Upon returning, wait for sync to remove the old event (don't need instant refresh because nothing bad can happen if you try to edit the ghost event)
      setTimeout(async () => {
        try {
          const seriesId = getSeriesId(eventId);
          const deleteResponse = await chrome.runtime.sendMessage({
            action: "deleteEvent",
            data: { calendarId, eventId: seriesId },
          });

          if (deleteResponse.success) {
            showNotification("Original event series deleted", "success");
            // Optional: reload after a delay to show the deletion
            //setTimeout(() => location.reload(), 3000);
          } else {
            showNotification(
              "Failed to delete original series: " + deleteResponse.error,
              "error",
            );
          }
        } catch (error) {
          console.error("Error deleting series:", error);
        }
      }, 1000);
    }
    // copy all: do nothing, this is default action
  }
}

function addHandles(target) {
  const dragTarget = document.createElement("div");
  dragTarget.setAttribute("aria-hidden", "true");
  dragTarget.className = "resched-top";
  dragTarget.onmousedown = onDragStart;
  target.appendChild(dragTarget);
}

let dragStart; // mouse Y when drag start
let dragEnd;
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

  if (isNaN(startingOffsetMinutes)) {
    // Click but no drag. Click event instead
    dragElem.click();
    return;
  }
  if (startingOffsetMinutes == 0) {
    // Did not change enough to save, notify
    showNotification("No change made", "success");
    revertEventChanges();
    return;
  }

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
  // TODO: can also get event id from `data-eventid`, base 64 decode `atob`
  const eventId = jslog.match(/2:\["([^"]+)"/)?.[1] ?? null;

  return [calendarId, eventId];
};

function getSeriesId(eventId) {
  return eventId?.includes("_") ? eventId.split("_")[0] : eventId;
}

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

function attachAll() {
  console.log("Attaching event handles");
  document.querySelectorAll("[data-eventchip]").forEach(addHandles);
}

function init() {
  const config = {
    attributes: true,
    childList: true,
    subtree: true,
    attributeFilter: ["data-eventchip"],
  };

  const observer = new MutationObserver(onMutation);
  // Observing `[role="main"]` loses tracking when changing pages
  observer.observe(document.body, config);

  attachAll();

  window.navigation.addEventListener("navigate", (e) => {
    // For some reason, gcal fires `navigate` events for clicking events & other random things
    // I only care about view changes
    const from = window.location.href;
    const to = e.destination.url;

    if (from !== to) {
      console.log(`Navigating from ${from} to ${to}`);
      // kinda hacky, but it works
      setTimeout(attachAll, 1000);
    }
  });
}

setTimeout(init, 1 * 1000);
