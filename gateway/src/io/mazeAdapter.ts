/**
 * Maze adapter: the ONLY import site of `../maze` in the gateway (Req 6.5, 6.6).
 *
 * `gateway/src/maze/` is owned by Labyrinth and must not be created or modified
 * by the gateway. Everything else in the gateway imports `maze` from here, typed
 * strictly as the `Maze` interface from `shared/contracts.ts`, so any drift in
 * Labyrinth's implementation surfaces as a type error at this single seam.
 */
import type { Maze } from "../../../shared/contracts";
import { maze as mazeImpl } from "../maze";

export const maze: Maze = mazeImpl;
