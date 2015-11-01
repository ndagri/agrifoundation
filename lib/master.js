var _ = require('lodash');

module.exports = function (context, config) {
    var cluster = context.cluster;
    var logger = context.logger;
    var configWorkers = context.sysconfig.terafoundation.workers;
    var start_workers =  true;

    if (config.start_workers === false) {
        start_workers = false;
    }
    var plugin = context.master_plugin;

    if (plugin) plugin.pre();

    var shuttingdown = false;

    var workerCount = configWorkers ? configWorkers : require('os').cpus().length;

    var shutdown = function () {
        logger.info("Shutting down.");
        shuttingdown = true;

        logger.info("Notifying workers to stop.");
        logger.info("Waiting for " + _.keys(cluster.workers).length + " workers to stop.");
        for (var id in cluster.workers) {
            cluster.workers[id].kill('SIGINT');
        }

        setInterval(function () {
            if (shuttingdown && _.keys(cluster.workers).length === 0) {
                logger.info("All workers have exited. Ending.");
                process.exit();
            }
            else if (shuttingdown) {
                logger.info("Waiting for workers to stop: " + _.keys(cluster.workers).length + " pending.");
            }
        }, 1000);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);


    if (start_workers) {
        logger.info("Starting " + workerCount + " workers.");
        for (var i = 0; i < workerCount; i++) {
            cluster.fork();
        }
    }


    cluster.on('exit', function (worker, code, signal) {
        if (!shuttingdown) {
            logger.error("Worker died " + worker.id + ": launching a new one");
            cluster.fork();
        }
    });

    if (plugin) plugin.post();

    // Put a friendly message on the terminal of the server.
    logger.info("Service starting");
};
