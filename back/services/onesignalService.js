// backend/services/onesignalService.js

const OneSignal = require("onesignal-node");

const client = new OneSignal.Client({
  userAuthKey: "ZTBiNjVhMWUtOWZkOC00NTcxLWJmMGEtMTI1NThkOGE2ZjU3",
  app: {
    appAuthKey: "ZTBiNjVhMWUtOWZkOC00NTcxLWJmMGEtMTI1NThkOGE2ZjU3",
    appId: "0dd2cd98-5dcc-4c27-ac94-c5c7d524a70b",
  },
});

const sendNotification = async (data) => {
  const { headings, contents, include_player_ids } = data;

  const notification = {
    headings: { en: headings },
    contents: { en: contents },
    include_player_ids: include_player_ids,
  };

  try {
    const response = await client.createNotification(notification);
    console.log("Notification sent:", response);
  } catch (error) {
    console.error("Error sending notification:", error);
  }
};

module.exports = { sendNotification };
