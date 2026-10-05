import type { Source } from "../schema.js";
import { remoteok } from "./remoteok.js";
import { weworkremotely } from "./weworkremotely.js";
import { devpost } from "./devpost.js";
import { superteam } from "./superteam.js";
import { remotive } from "./remotive.js";
import { himalayas } from "./himalayas.js";
import { workingnomads } from "./workingnomads.js";
import { jobicy } from "./jobicy.js";
import { hnhiring } from "./hnhiring.js";

/** To add a source: create a module exporting a Source, register it here, add a flag in config.yaml. */
export const registry: Record<string, Source> = {
  remoteok, weworkremotely, devpost, superteam, remotive, himalayas, workingnomads, jobicy, hnhiring,
};
