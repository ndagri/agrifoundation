'use strict';

var sys_schema = require('../system_schema');
var _ = require('lodash');
var convict = require('convict');
var getModule = require('./file_utils').getModule;

function getConnectorSchema(name, context, configFile) {
    var paths = {};
    var err = 'Could not retrieve schema code for: ' + name + '\n';

    var localPath = __dirname + '/connectors/' + name + '.js';
    paths[localPath] = true;

    if (context.ops_directory) {
        var opsPath = context.ops_directory + '/connectors/' + name + '.js';
        paths[opsPath] = true;
    }

    //getModule has a fallback to check node modules for connector schema
    return getModule(name, paths, err).config_schema();
}

function validateConfig(cluster, schema, configFile) {
    try {
        var config = convict(schema);
        config.load(configFile);

        if (cluster.isMaster) {
            config.validate();
        }

        return config.getProperties();
    }
    catch (err) {
        throw new Error('Error validating configuration, error: ' + err.stack)
    }
}

function extractSchema(fn, configFile) {
    if (fn && typeof fn === 'function') {
        return fn(configFile)
    }
    else if (fn && typeof fn === 'object') {
        return fn;
    }
    else {
        return {}
    }
}

module.exports = function(cluster, context, configFile) {
    var topLevelSchema = extractSchema(context.config_schema, configFile);
    var pluginSchema = extractSchema(context.plugin_schema, configFile);

    var topLevelName = context.name;
    var config = {};

    if (context.schema_formats) {
        context.schema_formats.forEach(function(format) {
            convict.addFormat(format)
        });
    }

    // iterate over top level config components
    _.forOwn(configFile, function(value, key) {
        //terafoundation
        if (configFile[key].connectors) {

            config[key] = validateConfig(cluster, sys_schema, configFile[key]);
            config[key].connectors = {};

            //iterate over different connectors
            _.forOwn(configFile[key].connectors, function(innerConfig, connector) {
                var innerSchema = getConnectorSchema(connector, context, configFile);
                config[key].connectors[connector] = {};

                //iterate over endpoints in connectors
                _.forOwn(configFile[key].connectors[connector], function(value, endpoint) {
                    config[key].connectors[connector][endpoint] = validateConfig(cluster, innerSchema, value);
                });
            });
        }

        //top level service configuration
        else {
            if (key === topLevelName) {
                config[key] = validateConfig(cluster, topLevelSchema, configFile[key]);
            }
            else if (pluginSchema[key]) {
                config[key] = validateConfig(cluster, pluginSchema[key], configFile[key]);
            }
            //Any other custom top level configuration outside terafoundation and teraserver
            else {
                config[key] = configFile[key]
            }
        }
    });

    return config;
};