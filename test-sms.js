const { sendSms } = require("./notify");
sendSms(process.argv[2], "Test from Thulamela system")
  .then(r => console.log("Result:", r))
  .catch(e => console.log("FAILED:", e.message));