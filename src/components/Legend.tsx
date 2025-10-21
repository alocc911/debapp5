import React from "react";

type LegendItem = {
  key: string;
  color: string;
  label: string;
  description?: string;
};

const DEFAULT_LEGEND: LegendItem[] = [
  { key: "activated", color: "#00A6FF", label: "Activated node", description: "Represents activated state" },
  { key: "inhibited", color: "#FF4D4F", label: "Inhibited node", description: "Represents inhibited state" },
  { key: "unknown", color: "#BFBFBF", label: "Unknown / unlabeled", description: "No specific label" },
];

export default function Legend({ items = DEFAULT_LEGEND }: { items?: LegendItem[] }) {
  return (
    <aside className="legend" aria-label="Graph legend">
      <h3 className="legend__title">Legend</h3>
      <ul className="legend__list">
        {items.map((it) => (
          <li key={it.key} className="legend__item" title={it.description ?? it.label}>
            <span
              className="legend__swatch"
              style={{ backgroundColor: it.color }}
              aria-hidden="true"
            />
            <span className="legend__label">{it.label}</span>
          </li>
        ))}
      </ul>
    </aside>
  );
}