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
let dragEventId; // Event ID that is being rescheduled
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
  dragEventId = dragElem.dataset.eventid;
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

function onDragEnd(ev) {
  console.log("drag end");
  // Convert to minutes
  const [top, height] = calcDragDimensions();
  const pxToMin = 526 / (11 * 60);
  alert("Duration: " + roundTo(height / pxToMin, 15) / 60);
  alert(
    "Delta start: " +
      roundTo((top - dragEventOriginalDim[0]) / pxToMin, 15) / 60,
  );

  // Restore interactivity
  document.documentElement.style.pointerEvents = "";
  dragElem.querySelector(".resched-top").style.pointerEvents = "";
  document.removeEventListener("mousemove", onDragMove);
  window.removeEventListener("mouseup", onDragEnd);
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
