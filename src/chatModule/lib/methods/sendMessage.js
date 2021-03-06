import Random from "react-native-meteor/lib/Random";

import messagesStatus from "../../constants/messagesStatus";
import buildMessage from "./helpers/buildMessage";
import { post } from "./helpers/rest";
import database from "../../../main/ran-db/sqlite";
import { store as reduxStore } from "../../../src";
import log from "../../utils/log";

export const getMessage = (rid, msg = {}) => {
  const _id = Random.id();
  const message = {
    _id,
    rid,
    msg,
    ts: new Date(),
    _updatedAt: new Date(),
    status: messagesStatus.TEMP,
    u: {
      _id: reduxStore.getState().login.user.id || "1",
      username: reduxStore.getState().login.user.username
    }
  };
  try {
    database.create("messages", message, true);
  } catch (error) {
    console.warn("getMessage", error);
  }
  return message;
};

function sendMessageByRest(message) {
  const { token, id } = this.ddp._login;
  const server = this.ddp.url.replace(/^ws/, "http");
  const { _id, rid, msg } = message;
  return post({ token, id, server }, "chat.sendMessage", {
    message: { _id, rid, msg }
  });
}

function sendMessageByDDP(message) {
  const { _id, rid, msg } = message;
  return this.ddp.call("sendMessage", { _id, rid, msg });
}

export async function _sendMessageCall(message) {
  try {
    // eslint-disable-next-line
    const data = await (this.ddp && this.ddp.status
      ? sendMessageByDDP.call(this, message)
      : sendMessageByRest.call(this, message));
    return data;
  } catch (e) {
    database.write(() => {
      message.status = messagesStatus.ERROR;
      database.create("messages", message, true);
    });
  }
}

export default async function(rid, msg) {
  try {
    const message = getMessage(rid, msg);
    // const room = await database.objects("subscriptions", `rid="${rid}"`);

    // database.write(() => {
    //   room.lastMessage = message;
    // });

    const ret = await _sendMessageCall.call(this, message);
    let test = buildMessage({ ...message, ...ret });
    console.log(test);

    // TODO: maybe I have created a bug in the future here <3
    database.create("messages", buildMessage({ ...message, ...ret }), true);
  } catch (e) {
    log("sendMessage", e);
  }
}
