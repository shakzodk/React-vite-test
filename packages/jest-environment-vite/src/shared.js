import createServer from "vite-server";
import stoppable from "stoppable";
import ipc from "node-ipc";
import istanbulApi from "istanbul-api";
import istanbulLibCoverage from "istanbul-lib-coverage";

let server;
const coverageMaps = [];

export async function setup(config) {
    const port = 3000;
    const {verbose} = config;
    server = createServer({port, verbose});
    stoppable(server, 0);

    ipc.config.id = "vite";
    ipc.config.silent = true;
    ipc.serve(() => ipc.server.on("coverage", message => {
        coverageMaps.push(message);
    }));
    ipc.server.start();
}

export async function teardown(config) {
    const logger = {
        log(...args) {
            if (verbose) {
                console.log(...args);
            }
        },
    };

    server.stop(() => logger.log("stopping server"));
    ipc.server.stop();
    const {verbose} = config;

    if (coverageMaps.length > 0) {
        logger.log("merging coverage");
        const coverageMap = istanbulLibCoverage.createCoverageMap({});
        coverageMaps.forEach(map => coverageMap.merge(map));
    
        logger.log("writing coverage report");
        const reporter = istanbulApi.createReporter();
        reporter.addAll(config.coverageReporters);
        reporter.write(coverageMap);
    }
}
