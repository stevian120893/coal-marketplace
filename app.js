#!/usr/bin/env node
"use strict";

const nextStart = require("next/dist/cli/next-start");

nextStart.nextStart({
  port: process.env.PORT || 3000,
  hostname: process.env.HOSTNAME || "0.0.0.0",
});