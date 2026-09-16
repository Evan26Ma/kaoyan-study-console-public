#!/usr/bin/env node
"use strict";

require("../import-manual45.js").main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
