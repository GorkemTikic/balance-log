// src/components/EventsSection.tsx
import React from "react";
import EventSummary from "./EventSummary";
import { Row, EVENT_KNOWN_CORE } from "../lib/types";
import OtherTypesBlock from "./OtherTypesBlock";

export default function EventsSection({ rows, onCopy }: { rows: Row[]; onCopy: () => void }) {
  const eventOther = rows.filter((r) => !EVENT_KNOWN_CORE.has(r.type));
  return (
    <div className="card">
      <div className="card-head" style={{ justifyContent: "space-between" }}>
        <h2>Event Contracts (separate product)</h2>
        <button className="btn" onClick={onCopy}>Copy Events</button>
      </div>
      <EventSummary rows={rows} />
      <div className="subcard">
        <h3>Event – Other Activity</h3>
        {eventOther.length ? <OtherTypesBlock rows={eventOther} /> : <p className="muted">None</p>}
      </div>
    </div>
  );
}
