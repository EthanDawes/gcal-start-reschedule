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
  target.appendChild(dragTarget);
  target.onmousedown = onHandleDrag;
}

let dragStart;
let dragElem;
let dragEventId;
let dragEventOriginalDim;

function onHandleDrag(ev) {
  ev.preventDefault();
  ev.stopPropagation();
  console.log("drag");
  dragStart = ev.pageY;
  dragElem = ev.target.parentElement;
  dragEventId = dragElem.dataset.eventid;
  dragEventOriginalDim = [
    Number.parseInt(dragElem.style.top),
    Number.parseInt(dragElem.style.height),
  ];

  document.addEventListener("mousemove", onEventDrag);

  document.addEventListener("mouseup", (ev) => {
    // TODO: prevent creating new event when mouse lifted
    ev.preventDefault();
    ev.stopPropagation();

    document.removeEventListener("mousemove", onEventDrag);
  });
}

function onEventDrag(ev) {
  const dragDiff = ev.pageY - dragStart;
  console.log("move", dragDiff);
  dragElem.style.top = dragEventOriginalDim[0] + dragDiff + "px";
  dragElem.style.height = dragEventOriginalDim[1] - dragDiff + "px";
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
