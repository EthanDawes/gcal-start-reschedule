// Background script for Google Calendar Start Reschedule extension
// Handles OAuth authentication and Google Calendar API operations

// const API_KEY = "YOUR_API_KEY_HERE";
// const DISCOVERY_DOC =
//   "https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest";
const SCOPES = "https://www.googleapis.com/auth/calendar.events";

// Store the OAuth token
let authToken = null;

// Listen for messages from content scripts or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "rescheduleEvent") {
    handleRescheduleEvent(message.data)
      .then((result) => sendResponse({ success: true, data: result }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true; // Keep the message channel open for async response
  }
});

// Main function to handle event rescheduling
async function handleRescheduleEvent({
  calendarId,
  eventId,
  startingOffsetMinutes,
  newDurationMinutes,
}) {
  try {
    // Authenticate if needed
    await authenticateIfNeeded();

    // Get the current event
    const event = await getEvent(calendarId, eventId);

    // Calculate new start and end times
    const currentStart = new Date(event.start.dateTime || event.start.date);
    const newStart = new Date(
      currentStart.getTime() + startingOffsetMinutes * 60 * 1000,
    );
    const newEnd = new Date(
      newStart.getTime() + newDurationMinutes * 60 * 1000,
    );

    // Update the event
    const updatedEvent = await updateEvent(calendarId, eventId, {
      ...event,
      start: {
        dateTime: newStart.toISOString(),
        timeZone: event.start.timeZone || "UTC",
      },
      end: {
        dateTime: newEnd.toISOString(),
        timeZone: event.end.timeZone || "UTC",
      },
    });

    console.log("Event successfully rescheduled:", updatedEvent);
    return updatedEvent;
  } catch (error) {
    console.error("Error rescheduling event:", error);
    throw error;
  }
}

// Authenticate with Google OAuth if token is not available or expired
async function authenticateIfNeeded() {
  if (!authToken) {
    authToken = await authenticate();
  }

  // Test if token is still valid
  try {
    await testTokenValidity();
  } catch (error) {
    console.log("Token expired or invalid, re-authenticating...");
    authToken = await authenticate();
  }
}

// Perform OAuth authentication using chrome.identity
async function authenticate() {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken(
      {
        interactive: true,
        scopes: [SCOPES],
      },
      (token) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (token) {
          console.log("Authentication successful");
          resolve(token);
        } else {
          reject(new Error("Failed to obtain auth token"));
        }
      },
    );
  });
}

// Test if the current token is still valid
async function testTokenValidity() {
  const response = await fetch(
    "https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=" + authToken,
  );
  if (!response.ok) {
    throw new Error("Token validation failed");
  }
}

// Get event details from Google Calendar API
async function getEvent(calendarId, eventId) {
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${authToken}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(
      `Failed to get event: ${error.error?.message || response.statusText}`,
    );
  }

  return await response.json();
}

// Update event in Google Calendar API
async function updateEvent(calendarId, eventId, eventData) {
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;

  // Remove read-only fields
  const updateData = { ...eventData };
  delete updateData.id;
  delete updateData.iCalUID;
  delete updateData.created;
  delete updateData.updated;
  delete updateData.creator;
  delete updateData.organizer;
  delete updateData.htmlLink;
  delete updateData.etag;
  delete updateData.kind;

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${authToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(updateData),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(
      `Failed to update event: ${error.error?.message || response.statusText}`,
    );
  }

  return await response.json();
}

// Clear authentication token (useful for debugging or logout)
function clearAuthToken() {
  authToken = null;
  chrome.identity.clearAllCachedAuthTokens(() => {
    console.log("All cached auth tokens cleared");
  });
}

// TODO: all of this probably doesn't need to be in the background
