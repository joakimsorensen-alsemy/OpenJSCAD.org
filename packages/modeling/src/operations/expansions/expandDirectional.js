const { EPS, TAU } = require("../../maths/constants");

const mat4 = require("../../maths/mat4");
const vec3 = require("../../maths/vec3");

const geom3 = require("../../geometries/geom3");
const poly3 = require("../../geometries/poly3");

const retessellate = require("../modifiers/retessellate");
const unionGeom3Sub = require("../booleans/unionGeom3Sub");
const extrudePolygon = require("./extrudePolygon");

/**
 * Expand a 3D mesh in one direction only
 * Only extrudes faces whose normals point in the specified direction
 * @param {Object} options - Options object
 * @param {Number} options.delta - Distance to expand
 * @param {String} options.direction - Direction to expand ('y', 'x', or 'z')
 * @param {Number} options.tolerance - How close the normal must be to the direction (default: 0.9)
 * @param {Object} geometry - Input geometry
 */
const expandDirectional = (options, geometry) => {
  const defaults = {
    delta: 1,
    direction: "y", // 'x', 'y', or 'z'
    tolerance: 0.9, // dot product threshold (0.9 ≈ 25.8° tolerance)
  };
  const { delta, direction, tolerance } = Object.assign({}, defaults, options);

  // Create target direction vector
  let targetDirection;
  switch (direction) {
    case "x":
      targetDirection = [1, 0, 0];
      break;
    case "y":
      targetDirection = [0, 1, 0];
      break;
    case "z":
      targetDirection = [0, 0, 1];
      break;
    default:
      targetDirection = [0, 1, 0]; // default to y
  }

  let result = geom3.create();
  const polygons = geom3.toPolygons(geometry);

  // Loop through polygons and only extrude those facing the target direction
  polygons.forEach((polygon) => {
    const normal = poly3.plane(polygon);

    // Check if this face's normal is close to our target direction
    const dotProduct = vec3.dot(normal, targetDirection);

    // Also check the opposite direction (negative normal)
    const dotProductNeg = vec3.dot(
      normal,
      vec3.scale(vec3.create(), targetDirection, -1),
    );

    if (
      Math.abs(dotProduct) > tolerance ||
      Math.abs(dotProductNeg) > tolerance
    ) {
      // This face is aligned with our target direction - extrude it
      const extrudevector = vec3.scale(vec3.create(), normal, 2 * delta);
      const translatedpolygon = poly3.transform(
        mat4.fromTranslation(
          mat4.create(),
          vec3.scale(vec3.create(), extrudevector, -0.5),
        ),
        polygon,
      );
      const extrudedface = extrudePolygon(extrudevector, translatedpolygon);
      result = unionGeom3Sub(result, extrudedface);
    } else {
      // This face is not aligned - just add it as-is (preserve side faces)
      result = unionGeom3Sub(result, geom3.create([polygon]));
    }
  });

  return retessellate(result);
};

module.exports = expandDirectional;
