'use strict';

const fs = require('fs');
const path = require('path');
const Promise = require('bluebird');
const debug = require('debug')('kcm:apply');
const filenameConverter = require('filename-converter');
const fse = require('fs-extra');
const _ = require('lodash');
const rp = require('request-promise');
const ENUMS = require('../enums');
const getObjects = require('../tools/get_objects');
const handleWrongStatusCode = require('../tools/non2xx_handler');
const logger = require('../utils/logger');

const TARGET_REGEX = /^upstreams_.*_targets$/;

// sequence: from https://github.com/petkaantonov/bluebird/issues/70
/**
 * a utility to check if a value is a Promise or not
 * @param value
 */
const isPromise = value =>
  value !== null &&
  typeof value === 'object' &&
  typeof value.then === 'function';

/**
 * a utility to resolve an array of promises sequentially
 * @param {Array} array any array of promises, values or a mix
 * @param {Function} func an optional function to create a promises from values if not exists Promise.resolve will be used
 * @return {Promise}
 */
const sequence = (array, func) =>
  array.reduce(
    (a, b) =>
      a.then(() => {
        let value = typeof func === 'function' ? func(b) : b;
        if (typeof value === 'function') {
          value = value();
        }
        return isPromise(value) ? value : Promise.resolve(value);
      }),
    Promise.resolve()
  );

module.exports = function apply(dir, host, config) {
  function core(obj) {
    debug(`Ready to apply object ${obj}...`);

    const isTarget = TARGET_REGEX.test(obj);
    const idField = isTarget
      ? ENUMS.IDENTIFIRES.targets
      : ENUMS.IDENTIFIRES[obj] || 'id';

    const rpUrl =
      host + '/' + _.replace(filenameConverter.deserialize(obj), /_/g, '/');
    debug(`${obj}: the base request url to GET info is ${rpUrl}`);
    return rp(rpUrl)
      .then(body => {
        const res = JSON.parse(body);
        return res.data || [];
      })
      .catch(err => handleWrongStatusCode(err, rpUrl))
      .tap(remoteObjs => {
        // initial variables
        const remoteIds = _.map(remoteObjs, idField).filter(v => !!v);
        const items = fs.readdirSync(path.resolve(dir, obj));
        const itemIds = items.map(v =>
          filenameConverter.deserialize(_.initial(v.split('.')).join('.'))
        );

        // make 3 sets
        const itemsToDelete = _.without.apply(
          null,
          _.concat([remoteIds], itemIds)
        );
        const newItemIds = _.without.apply(
          null,
          _.concat([itemIds], remoteIds)
        );
        const patchItemIds = _.intersection(itemIds, remoteIds);

        // for target object only
        let upstreamId = null;
        if (isTarget) upstreamId = obj.split('_')[1];

        return sequence([
          // Delete
          sequence(itemsToDelete, itemToDeleteId =>
            Promise.resolve()
              .then(() =>
                obj === 'plugins'
                  ? rp({
                      method: 'GET',
                      uri: `${host}/plugins/${itemToDeleteId}`,
                      timeout: ENUMS.REQUEST_TIMEOUT
                    }).then(body => {
                      const res = JSON.parse(body);
                      return res.api_id
                        ? `${host}/apis/${res.api_id}/plugins/${itemToDeleteId}`
                        : `${host}/plugins/${itemToDeleteId}`;
                    })
                  : isTarget
                  ? `${host}/upstreams/${upstreamId}/targets/${itemToDeleteId}`
                  : `${rpUrl}/${itemToDeleteId}`
              )
              .then(itemToDeleteUrl =>
                rp({
                  method: 'DELETE',
                  uri: itemToDeleteUrl,
                  timeout: ENUMS.REQUEST_TIMEOUT
                })
                  .then(() => {
                    debug(`[${obj}] Success to DELETE item ${itemToDeleteId}!`);
                  })
                  .catch(err =>
                    handleWrongStatusCode(err, itemToDeleteUrl, 'DELETE')
                  )
              )
          ),
          // create / update
          sequence(newItemIds, newItemId => {
            debug(`new id ${newItemId}`);
            const newItemPath = path.resolve(dir, obj, `${newItemId}.json`);
            const newItemObj = require(newItemPath);
            const method = obj === 'services' ? 'PUT' : 'POST';
            debug(obj);
            debug(method);
            let newItemUrl =
              obj === 'plugins'
                ? newItemObj.api_id
                  ? `${host}/apis/${newItemObj.api_id}/plugins/`
                  : `${host}/plugins`
                : isTarget
                ? `${host}/upstreams/${upstreamId}/targets`
                : `${host}/${obj}`;
            /*
            if (method === "PUT") {
              newItemUrl = newItemUrl + newItemId;
            }
            */
            return rp({
              method,
              uri: newItemUrl,
              body: newItemObj,
              json: true,
              timeout: ENUMS.REQUEST_TIMEOUT
            })
              .then(() => {
                debug(`[${obj}] Success to ${method} item ${newItemId}!`);
              })
              .catch(err => handleWrongStatusCode(err, newItemUrl, method));
          }),
          // Patch
          Promise.resolve().then(() =>
            isTarget || obj === 'cluster'
              ? true
              : sequence(patchItemIds, patchItemId => {
                  const localPatchItemPath = path.resolve(
                    dir,
                    obj,
                    `${patchItemId}.json`
                  );
                  const localPatchItemObj = require(localPatchItemPath);
                  const remotePatchItemObj = _.find(
                    remoteObjs,
                    o => o[idField] === patchItemId
                  );
                  if (!_.isEqual(localPatchItemObj, remotePatchItemObj)) {
                    const patchItemUrl =
                      obj === 'plugins'
                        ? localPatchItemObj.api_id
                          ? `${host}/apis/${
                              localPatchItemObj.api_id
                            }/plugins/${patchItemId}`
                          : `${host}/plugins/${patchItemId}`
                        : `${host}/${obj}/${patchItemId}`;
                    return rp({
                      method: 'PATCH',
                      uri: patchItemUrl,
                      body: localPatchItemObj,
                      json: true,
                      timeout: ENUMS.REQUEST_TIMEOUT
                    })
                      .then(() => {
                        debug(`[${obj}] Success to PATCH item ${patchItemId}!`);
                      })
                      .catch(err =>
                        handleWrongStatusCode(err, patchItemUrl, 'PATCH')
                      );
                  }
                })
          )
        ]);
      });
  }

  return getObjects(host).then(OBJECTS => {
    var configObjects;
    if (config.objects) {
      if (!_.isArray(config.objects)) {
        logger.error(`'objects' field of '${name}' must be an array of string`);
      } else {
        configObjects = config.objects;
      }
    }

    debug(OBJECTS);
    debug(configObjects);

    const objDirs = fs.readdirSync(dir);
    debug(`configs of these objects are found: ${objDirs}`);

    let firstClassObjs; // interestion of static enumeration and either the configuration or directories
    // apply objects sets in order of either the static enumeration or the configuration
    if (configObjects) {
      firstClassObjs = configObjects.filter(
        obj => _.includes(OBJECTS, obj) && _.includes(objDirs, obj)
      );
    } else {
      firstClassObjs = objDirs.filter(obj => _.includes(OBJECTS, obj));
    }
    let secondClassObjs = objDirs.filter(obj => TARGET_REGEX.test(obj));

    if (config.object_type) {
      firstClassObjs = firstClassObjs.filter(obj => obj === config.object_type);
      secondClassObjs = [];
    }

    debug(firstClassObjs);
    debug(secondClassObjs);

    process.exit(1);

    return Promise.map(firstClassObjs, core).then(() =>
      Promise.map(secondClassObjs, core)
    );
  });
};
