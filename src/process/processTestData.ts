import type { ProcessToken } from "./processTypes";

const start: ProcessToken = {
  id: "start",
  type: "start",
  label: "Starting point",
  category: "anchor",
  order: 0,
  permanent: true,
  asset: "vertrekpunt@2x.png",
};

const end: ProcessToken = {
  id: "end",
  type: "end",
  label: "Endpoint",
  category: "anchor",
  order: 1,
  permanent: true,
  asset: "eindpunt@2x.png",
};

/** The process as it appears before any phase or activity is added. */
export const initialProcess: ProcessToken[] = [start, end];
