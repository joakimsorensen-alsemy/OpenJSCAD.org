import { Path2, Geom2, Geom3 } from "../../geometries/types";
import { Corners } from "../../utils/corners";
import RecursiveArray from "../../utils/recursiveArray";

export default expandDirectional;

export interface ExpandDirectionalOptions {
  delta?: number;
  direction?: "x" | "y" | "z";
  tolerance?: number;
}

type Geom = Path2 | Geom2 | Geom3;

declare function expandDirectional(
  options: ExpandOptions,
  geometry: Path2 | Geom2,
): Geom2;
declare function expandDirectional(
  options: ExpandOptions,
  geometry: Geom3,
): Geom3;
declare function expandDirectional<T extends Geom>(
  options?: ExpandOptions,
  ...geometries: RecursiveArray<T>
): Array<T>;
declare function expandDirectional(
  options?: ExpandOptions,
  ...geometries: RecursiveArray<Geom>
): Array<Geom>;
