/**
 * @module ol/Feature
 */
import {assert} from './asserts.js';
import {listen, unlisten, unlistenByKey} from './events.js';
import EventType from './events/EventType.js';
import {inherits} from './index.js';
import BaseObject from './Object.js';
import Geometry from './geom/Geometry.js';
import Style from './style/Style.js';

/**
 * @classdesc
 * A vector object for geographic features with a geometry and other
 * attribute properties, similar to the features in vector file formats like
 * GeoJSON.
 *
 * Features can be styled individually with `setStyle`; otherwise they use the
 * style of their vector layer.
 *
 * Note that attribute properties are set as {@link ol.Object} properties on
 * the feature object, so they are observable, and have get/set accessors.
 *
 * Typically, a feature has a single geometry property. You can set the
 * geometry using the `setGeometry` method and get it with `getGeometry`.
 * It is possible to store more than one geometry on a feature using attribute
 * properties. By default, the geometry used for rendering is identified by
 * the property name `geometry`. If you want to use another geometry property
 * for rendering, use the `setGeometryName` method to change the attribute
 * property associated with the geometry for the feature.  For example:
 *
 * ```js
 * var feature = new ol.Feature({
 *   geometry: new ol.geom.Polygon(polyCoords),
 *   labelPoint: new ol.geom.Point(labelCoords),
 *   name: 'My Polygon'
 * });
 *
 * // get the polygon geometry
 * var poly = feature.getGeometry();
 *
 * // Render the feature as a point using the coordinates from labelPoint
 * feature.setGeometryName('labelPoint');
 *
 * // get the point geometry
 * var point = feature.getGeometry();
 * ```
 *
 * @constructor
 * @extends {ol.Object}
 * @param {ol.geom.Geometry|Object.<string, *>=} opt_geometryOrProperties
 *     You may pass a Geometry object directly, or an object literal
 *     containing properties.  If you pass an object literal, you may
 *     include a Geometry associated with a `geometry` key.
 * @api
 */
const Feature = function(opt_geometryOrProperties) {

  BaseObject.call(this);

  /**
   * @private
   * @type {number|string|undefined}
   */
  this.id_ = undefined;

  /**
   * @type {string}
   * @private
   */
  this.geometryName_ = 'geometry';

  /**
   * User provided style.
   * @private
   * @type {ol.style.Style|Array.<ol.style.Style>|ol.StyleFunction}
   */
  this.style_ = null;

  /**
   * @private
   * @type {ol.StyleFunction|undefined}
   */
  this.styleFunction_ = undefined;

  /**
   * @private
   * @type {?ol.EventsKey}
   */
  this.geometryChangeKey_ = null;

  listen(
    this, BaseObject.getChangeEventType(this.geometryName_),
    this.handleGeometryChanged_, this);

  if (opt_geometryOrProperties !== undefined) {
    if (opt_geometryOrProperties instanceof Geometry ||
        !opt_geometryOrProperties) {
      const geometry = opt_geometryOrProperties;
      this.setGeometry(geometry);
    } else {
      /** @type {Object.<string, *>} */
      const properties = opt_geometryOrProperties;
      this.setProperties(properties);
    }
  }
};

inherits(Feature, BaseObject);


/**
 * Clone this feature. If the original feature has a geometry it
 * is also cloned. The feature id is not set in the clone.
 * @return {ol.Feature} The clone.
 * @api
 */
Feature.prototype.clone = function() {
  const clone = new Feature(this.getProperties());
  clone.setGeometryName(this.getGeometryName());
  const geometry = this.getGeometry();
  if (geometry) {
    clone.setGeometry(geometry.clone());
  }
  const style = this.getStyle();
  if (style) {
    clone.setStyle(style);
  }
  return clone;
};


/**
 * Get the feature's default geometry.  A feature may have any number of named
 * geometries.  The "default" geometry (the one that is rendered by default) is
 * set when calling {@link ol.Feature#setGeometry}.
 * @return {ol.geom.Geometry|undefined} The default geometry for the feature.
 * @api
 * @observable
 */
Feature.prototype.getGeometry = function() {
  return /** @type {ol.geom.Geometry|undefined} */ (
    this.get(this.geometryName_));
};


/**
 * Get the feature identifier.  This is a stable identifier for the feature and
 * is either set when reading data from a remote source or set explicitly by
 * calling {@link ol.Feature#setId}.
 * @return {number|string|undefined} Id.
 * @api
 */
Feature.prototype.getId = function() {
  return this.id_;
};


/**
 * Get the name of the feature's default geometry.  By default, the default
 * geometry is named `geometry`.
 * @return {string} Get the property name associated with the default geometry
 *     for this feature.
 * @api
 */
Feature.prototype.getGeometryName = function() {
  return this.geometryName_;
};


/**
 * Get the feature's style. Will return what was provided to the
 * {@link ol.Feature#setStyle} method.
 * @return {ol.style.Style|Array.<ol.style.Style>|ol.StyleFunction} The feature style.
 * @api
 */
Feature.prototype.getStyle = function() {
  return this.style_;
};


/**
 * Get the feature's style function.
 * @return {ol.StyleFunction|undefined} Return a function
 * representing the current style of this feature.
 * @api
 */
Feature.prototype.getStyleFunction = function() {
  return this.styleFunction_;
};


/**
 * @private
 */
Feature.prototype.handleGeometryChange_ = function() {
  this.changed();
};


/**
 * @private
 */
Feature.prototype.handleGeometryChanged_ = function() {
  if (this.geometryChangeKey_) {
    unlistenByKey(this.geometryChangeKey_);
    this.geometryChangeKey_ = null;
  }
  const geometry = this.getGeometry();
  if (geometry) {
    this.geometryChangeKey_ = listen(geometry,
      EventType.CHANGE, this.handleGeometryChange_, this);
  }
  this.changed();
};


/**
 * Set the default geometry for the feature.  This will update the property
 * with the name returned by {@link ol.Feature#getGeometryName}.
 * @param {ol.geom.Geometry|undefined} geometry The new geometry.
 * @api
 * @observable
 */
Feature.prototype.setGeometry = function(geometry) {
  this.set(this.geometryName_, geometry);
};


/**
 * Set the style for the feature.  This can be a single style object, an array
 * of styles, or a function that takes a resolution and returns an array of
 * styles. If it is `null` the feature has no style (a `null` style).
 * @param {ol.style.Style|Array.<ol.style.Style>|ol.StyleFunction} style Style for this feature.
 * @api
 * @fires ol.events.Event#event:change
 */
Feature.prototype.setStyle = function(style) {
  this.style_ = style;
  this.styleFunction_ = !style ?
    undefined : Feature.createStyleFunction(style);
  this.changed();
};


/**
 * Set the feature id.  The feature id is considered stable and may be used when
 * requesting features or comparing identifiers returned from a remote source.
 * The feature id can be used with the {@link ol.source.Vector#getFeatureById}
 * method.
 * @param {number|string|undefined} id The feature id.
 * @api
 * @fires ol.events.Event#event:change
 */
Feature.prototype.setId = function(id) {
  this.id_ = id;
  this.changed();
};


/**
 * Set the property name to be used when getting the feature's default geometry.
 * When calling {@link ol.Feature#getGeometry}, the value of the property with
 * this name will be returned.
 * @param {string} name The property name of the default geometry.
 * @api
 */
Feature.prototype.setGeometryName = function(name) {
  unlisten(
    this, BaseObject.getChangeEventType(this.geometryName_),
    this.handleGeometryChanged_, this);
  this.geometryName_ = name;
  listen(
    this, BaseObject.getChangeEventType(this.geometryName_),
    this.handleGeometryChanged_, this);
  this.handleGeometryChanged_();
};


/**
 * Convert the provided object into a feature style function.  Functions passed
 * through unchanged.  Arrays of ol.style.Style or single style objects wrapped
 * in a new feature style function.
 * @param {ol.StyleFunction|!Array.<ol.style.Style>|!ol.style.Style} obj
 *     A feature style function, a single style, or an array of styles.
 * @return {ol.StyleFunction} A style function.
 */
Feature.createStyleFunction = function(obj) {
  if (typeof obj === 'function') {
    return obj;
  } else {
    /**
     * @type {Array.<ol.style.Style>}
     */
    let styles;
    if (Array.isArray(obj)) {
      styles = obj;
    } else {
      assert(obj instanceof Style,
        41); // Expected an `ol.style.Style` or an array of `ol.style.Style`
      styles = [obj];
    }
    return function() {
      return styles;
    };
  }
};
export default Feature;
