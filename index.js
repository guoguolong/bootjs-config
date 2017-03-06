"use strict";

const _ = require('lodash');
const fs = require('fs');
const yaml = require('js-yaml');

/**
 *  
 *  @param options = {
 *     excludeFiles: [排除的文件列表] // 暂未实现.
 *     env: "<环境变量标识>" // 传入，则不再检查NODE_ENV和env.js文件.
 *  }
 *
 */
module.exports = function(configBaseDir, options) {
    function loadConfigs(config, baseDir, excludeFile) {
        if (fs.existsSync(baseDir)) {
            let dir = fs.readdirSync(baseDir);
            dir.forEach(function (item) { // 加载扩展名为.js的文件.
                let stats = fs.statSync(baseDir + item);
                if (stats.isFile() && item.match(/\.js$/)) {
                    if (excludeFile && item == excludeFile) {
                        return;
                    }
                    let moduleConfig = require(baseDir + item);
                    if (_.isFunction(moduleConfig)) {
                        moduleConfig = moduleConfig(config);
                    }
                    moduleConfig.params = {}; // params是内置节点，使用无效.
                    _.merge(config, moduleConfig);
                }
            });
        }
        return config;
    }

    function loadYamls(config, baseDir) {
        if (fs.existsSync(baseDir)) {
            let dir = fs.readdirSync(baseDir);
            dir.forEach(function (item) { // 加载扩展名为.js的文件.
                let stats = fs.statSync(baseDir + item);
                if (stats.isFile() && item.match(/\.yml$|yaml$/)) {
                    let yamlConfig = yaml.safeLoad(fs.readFileSync(baseDir + item, 'utf8'));
                    _.merge(config, yamlConfig);
                }
            });
        }
        return config;
    }

    let config = {};
    // 1. 正规化config.env节点.
    let configEnvBaseDir = configBaseDir + 'env/';
    if (options && options.env) {
        config.env = options.env;
    } else {
        let configEnvJs = configEnvBaseDir + 'env.js';
        if (process.env['NODE_ENV']) {
            config.env = process.env['NODE_ENV'];
        } else {
            if (fs.existsSync(configEnvJs)) {
                _.merge(config, require(configEnvJs));
            }
        }
    }
    let configEnvDir = config.env && configEnvBaseDir + config.env + '/';
    
    // 2. 加载参数配置文件，合并到config.params
    let yamlConfig = loadYamls({}, configBaseDir); // 遍历配置目录并加载 参数配置yaml文件 
    yamlConfig = loadYamls(yamlConfig, configEnvDir);
    config.params = yamlConfig || {};

    // 3. 加载配置目录、autoloadings、环境配置目录下所有配置文件
    config = loadConfigs(config, configBaseDir);
    config = loadConfigs(config, configBaseDir + 'autoloadings/');
    config = loadConfigs(config, configEnvDir);
    config = loadConfigs(config, configEnvDir + 'autoloadings/');
    config.loadPlugins = function(app, callback) {

        app.addPlugin = function(name, value) {
            let plugins = this.getPlugin();
            plugins[name] = value;
            app.set('plugins', plugins);
        };

        app.getPlugin = function(name) {
            let plugins = app.get('plugins');
            if (!plugins) {
                app.set('plugins', {});
            }
            plugins = app.get('plugins');
            if (name) {
                return plugins[name];
            }
            return plugins;
        };

        config.plugins = config.plugins || {};
        for (let pluginKey in config.plugins) {
            let pluginConf = config.plugins[pluginKey];
            pluginConf.env = config.env;
            pluginConf.name = pluginConf.name || pluginKey;
            try {
                let modulePath = pluginConf.moduleName;
                if (pluginConf.localModuleBaseDir) modulePath = pluginConf.localModuleBaseDir + modulePath;
                let pluginObj = require(modulePath)(app, pluginConf);
                app.addPlugin(pluginConf.name, pluginObj);
                pluginObj.init(config);
                if(callback) callback(pluginObj);
            } catch (e) {
                console.error(e);
            }
        }
    }
    return config;
}