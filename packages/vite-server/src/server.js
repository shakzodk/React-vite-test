#!/usr/bin/env node
const express = require("express");
const fs = require("fs");
const path = require("path");
const child_process = require("child_process");
const {transformSync} = require("@babel/core");
const commandExists = require("command-exists").sync;

const cjs2es = require("./cjs2es.js");

const app = express();

app.use(express.json());

const modifiers = {
    shift: false,
    alt: false,
    control: false,
}
let shift = false;

const getActiveModifiers = () => {
    return Object.keys(modifiers).filter(key => modifiers[key]);
}

const mouseDelay = 100;
const keyboardDelay = 500;

const sleep = async (duration) => 
    new Promise((resolve, reject) =>
        setTimeout(resolve, duration));

let screenshotCmd = null;
if (commandExists("screencapture")) {
    screenshotCmd = "screencapture";
} else if (commandExists("import")) {
    screenshotCmd = "import";
}

// const config = require(path.join(process.cwd(), "config.json"));
const config = {
    screenshots: "screenshots",
    fixtures: "fixtures",
};

app.post("/screenshot/:display", (req, res) => {
    const start = Date.now();
    const display = req.params.display;
    const {bounds} = req.body;
    const filename = path.join(process.cwd(), config.screenshots, req.body.filename);
    const {x, y, width, height} = bounds;

    let cmd = null;
    if (screenshotCmd === "screencapture") {
        cmd = `${screenshotCmd} -R${x},${y},${width},${height} ${filename}`;
    } else if (screenshotCmd === "import") {
        cmd = `${screenshotCmd} -display :${display} -window root -crop ${width}x${height}+${x}+${y} ${filename}`;
    } else {
        res.status(500);
        res.end();
    }

    console.log(`saving: ${req.body.filename}`);

    child_process.exec(cmd, (err, stdout, stderr) => {
        if (err) {
            res.send("failed");
        } else {
            res.send(`screenshot saved to ${req.body.filename}`);
            const elapsed = Date.now() - start;
            console.log(`screenshot took ${elapsed}ms`);
        }
    });
});

app.post("/log", (req, res) => {
    const {message} = req.body;
    console.log(message);
    res.send("okay");
});

const modules = {};

const serveModule = (res, name) => {
    const filename = name === "@khanacademy/vite-helpers"
        ? path.join(__dirname, "helpers.js")
        : path.join(__dirname, '../../../node_modules', name);

    if (!fs.existsSync(filename)) {
        console.log(`${filename} doesn't exist`);
        res.status(404);
        res.end();
    }

    console.log(`serving: ${name}`);
    if (name in modules) {
        res.type('js');
        res.send(modules[name]);
    } else {
        cjs2es(name).then(code => {
            res.type('js');
            res.send(code);
            modules[name] = code;
        });
    }
}

// compile node modules on the fly to ES6 modules
app.get("/node_modules/:module.js", (req, res) => {
    console.log("requesting a module");
    const name = req.params.module;
    serveModule(res, name);
});

app.get("/node_modules/:scope/:module", (req, res) => {
    const name = req.params.module;
    const scope = req.params.scope;
    serveModule(res, `${scope}/${name}`);
});

app.get('/fixtures', (req, res) => {
    const fixtures = fs.readdirSync(config.fixtures);
    console.log(`fixtures: ${fixtures.join(', ')}`);

    res.type('json');
    res.send(fixtures);
});

app.post('/finish/:runner', (req, res) => {
    const runner = req.params.runner;
    if (browsers[runner]) {
        browsers[runner].kill('SIGHUP');
    }
    process.exit();
});

const compile = (filename) => {
    const src = fs.readFileSync(filename).toString();
    const relativePath = path.relative(process.cwd(), filename);

    const code = transformSync(src, {
        plugins: ["@babel/plugin-syntax-dynamic-import", "istanbul"],
        presets: ["@babel/preset-react"],
        filename: relativePath,
        babelrc: false,
    }).code;

    return code.replace(/from\s+\"([^\"\.\/][^\"]+)\"/g, 
        (match, group1, offset, string) => `from "/node_modules/${group1}.js"`);
}

const serveJsFile = (req, res, filename) => {
    if (!fs.existsSync(filename)) {
        console.log(`${filename} doesn't exist`);
        res.status(404);
        res.end();
    }

    // TODO(kevinb): cache compiled code and update cache when code changes
    console.log(`serving: ${req.path} using ${filename}`);
    res.type('js');
    res.send(compile(filename));
}

app.get('/fixtures/*.js', (req, res) => {
    const filename = path.join(
        config.fixtures, 
        path.relative('fixtures', req.path.slice(1)),
    );

    serveJsFile(req, res, filename);
});

// compile all JS files with sucrase to get convert JSX to plain JS
app.get('*.js', (req, res) => {
    const filename = req.path.slice(1);
    const fullPath = filename === "index.js"
        ? path.join(__dirname, filename)
        : path.join(process.cwd(), filename);

    serveJsFile(req, res, fullPath);
});

const indexHandler = (req, res) => {
    const filename = req.path.slice(1);
    const fullPath = path.join(__dirname, "index.html");

    if (!fs.existsSync(fullPath)) {
        console.log(`${fullPath} doesn't exist`);
        res.status(404);
        res.end();
    }

    console.log(`serving: ${filename}`);
    const contents = fs.readFileSync(fullPath).toString();
    res.type('html');
    res.send(contents);
};

app.get('/index.html', indexHandler);
app.get('/', indexHandler);

const server = app.listen(3000, () => console.log("listening on port 3000"));

// TODO: check process.platform and start appropriate browser
const browsers = [];

module.exports = server;
