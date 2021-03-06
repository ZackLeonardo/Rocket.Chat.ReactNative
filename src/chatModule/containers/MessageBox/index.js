import React from "react";
import PropTypes from "prop-types";
import {
  View,
  FlatList,
  Text,
  TouchableOpacity,
  Alert,
  Keyboard,
  Platform,
  Animated
} from "react-native";
import Icon from "@expo/vector-icons/MaterialIcons";
import IconPlus from "@expo/vector-icons/Entypo";
import { connect } from "react-redux";
import { emojify } from "react-emojione";
// import { KeyboardAccessoryView } from "react-native-keyboard-input";
import InputToolbar from "../InputToolbar";
import { Permissions } from "expo";
import i18n from "i18n-js";

import { userTyping } from "../../actions/room";
import RocketChat from "../../lib/rocketchat";
import { editRequest, editCancel, replyCancel } from "../../actions/messages";
import styles from "./styles";
// import MyIcon from "../icons";
import database from "../../../main/ran-db/sqlite";
import Avatar from "../Avatar";
import CustomEmoji from "../EmojiPicker/CustomEmoji";
import Recording from "./Recording";
import FilesActions from "./FilesActions";
import EmojiKeyboard from "./EmojiKeyboard";
import log from "../../utils/log";
import ReplyPreview from "./ReplyPreview";
import ActionModal from "../../../base/components/ActionModal";
import MediaPicker from "../../../base/components/MediaPicker";

const MENTIONS_TRACKING_TYPE_USERS = "@";
const MENTIONS_TRACKING_TYPE_EMOJIS = ":";
const ANIMATEDPERIOD = 200;
const MIN_COMPOSER_HEIGHT = Platform.select({
  ios: 33,
  android: 41
});
const MAX_COMPOSER_HEIGHT = 96;

const onlyUnique = function onlyUnique(value, index, self) {
  return self.indexOf(({ _id }) => value._id === _id) === index;
};

@connect(
  state => ({
    roomType: state.room.t,
    message: state.messages.message,
    replyMessage: state.messages.replyMessage,
    replying: state.messages.replyMessage && !!state.messages.replyMessage.msg,
    editing: state.messages.editing,
    baseUrl: state.settings.Site_Url || state.server ? state.server.server : "",
    username: state.login.user && state.login.user.username
  }),
  dispatch => ({
    editCancel: () => dispatch(editCancel()),
    editRequest: message => dispatch(editRequest(message)),
    typing: status => dispatch(userTyping(status)),
    closeReply: () => dispatch(replyCancel())
  })
)
export default class MessageBox extends React.PureComponent {
  static propTypes = {
    rid: PropTypes.string.isRequired,
    baseUrl: PropTypes.string.isRequired,
    message: PropTypes.object,
    replyMessage: PropTypes.object,
    replying: PropTypes.bool,
    editing: PropTypes.bool,
    username: PropTypes.string,
    roomType: PropTypes.string,
    editCancel: PropTypes.func.isRequired,
    editRequest: PropTypes.func.isRequired,
    onSubmit: PropTypes.func.isRequired,
    typing: PropTypes.func,
    closeReply: PropTypes.func
  };

  constructor(props) {
    super(props);
    this.state = {
      text: "",
      mentions: [],
      showEmojiKeyboard: false,
      showFilesAction: false,
      recording: false,
      filesaction: "",
      inputToolbarFloatUp: new Animated.Value(0)
    };
    this.users = [];
    this.rooms = [];
    this.emojis = [];
    this.customEmojis = [];
    this._onEmojiSelected = this._onEmojiSelected.bind(this);

    this.typingDisabled = false;
  }

  componentWillReceiveProps(nextProps) {
    if (this.props.message !== nextProps.message && nextProps.message.msg) {
      this.setState({ text: nextProps.message.msg });
      this.component.focus();
    } else if (
      this.props.replyMessage !== nextProps.replyMessage &&
      nextProps.replyMessage.msg
    ) {
      this.component.focus();
    } else if (!nextProps.message) {
      this.setState({ text: "" });
    }
  }

  componentWillMount = () => {
    this.keyboardWillShowListener = Keyboard.addListener(
      "keyboardWillShow",
      this.keyboardWillShow
    );
    this.keyboardWillHideListener = Keyboard.addListener(
      "keyboardWillHide",
      this.keyboardWillHide
    );
    this.keyboardDidShowListener = Keyboard.addListener(
      "keyboardDidShow",
      this.keyboardDidShow
    );
    this.keyboardDidHideListener = Keyboard.addListener(
      "keyboardDidHide",
      this.keyboardDidHide
    );
  };

  componentWillUnmount() {
    this.keyboardDidShowListener.remove();
    this.keyboardWillShowListener.remove();
    this.keyboardDidHideListener.remove();
    this.keyboardWillHideListener.remove();
  }

  keyboardWillShow = e => {
    console.log("keyboardWillShow " + e.endCoordinates.height);
    let keyboardHeight = e.endCoordinates.height;
    if (keyboardHeight > 216) {
      this.closeEmoji();
      this.typingDisabled = true;
    }

    Animated.timing(this.state.inputToolbarFloatUp, {
      toValue: keyboardHeight,
      duration: ANIMATEDPERIOD
    }).start();
  };

  keyboardDidShow = e => {
    if (Platform.OS === "android") {
      this.keyboardWillShow(e);
    }
    this.typingDisabled = false;
  };

  keyboardWillHide = e => {
    console.log("_keyboardWillHide " + e.endCoordinates.height);
    this.typingDisabled = true;
    Animated.timing(this.state.inputToolbarFloatUp, {
      toValue: 0,
      duration: ANIMATEDPERIOD
    }).start();
  };

  keyboardDidHide = e => {
    if (Platform.OS === "android") {
      this.keyboardWillHide(e);
    }
    this.typingDisabled = false;
  };

  onChangeText = text => {
    this.setState({ text });
    // this.component.refs.composerRef.setText(text);
    this.props.typing(text.length > 0);

    // requestAnimationFrame(() => {
    //   const { start, end } = this.component._lastNativeSelection;

    //   const cursor = Math.max(start, end);

    //   const lastNativeText = this.component._lastNativeText;

    //   const regexp = /(#|@|:)([a-z0-9._-]+)$/im;

    //   const result = lastNativeText.substr(0, cursor).match(regexp);
    //   if (!result) {
    //     return this.stopTrackingMention();
    //   }
    //   const [, lastChar, name] = result;

    //   this.identifyMentionKeyword(name, lastChar);
    // });
  };

  get leftButtons() {
    const { editing } = this.props;
    if (editing) {
      return (
        <Icon
          style={styles.actionButtons}
          name="close"
          accessibilityLabel={i18n.t("ran.chat.Cancel_editing")}
          accessibilityTraits="button"
          onPress={() => this.editCancel()}
          testID="messagebox-cancel-editing"
        />
      );
    }
    return !this.state.showEmojiKeyboard ? (
      <Icon
        style={styles.actionButtons}
        onPress={() => this.openEmoji()}
        accessibilityLabel={i18n.t("ran.chat.Open_emoji_selector")}
        accessibilityTraits="button"
        name="mood"
        testID="messagebox-open-emoji"
      />
    ) : (
      <Icon
        onPress={() => {
          this.component.refs.composerRef.refs.composerInput.focus();
        }}
        style={styles.actionButtons}
        accessibilityLabel={i18n.t("ran.chat.Close_emoji_selector")}
        accessibilityTraits="button"
        name="keyboard"
        testID="messagebox-close-emoji"
      />
    );
  }
  get rightButtons() {
    const icons = [];

    if (this.state.text) {
      icons.push(
        <Icon
          style={[styles.actionButtons, { color: "#1D74F5" }]}
          name="send"
          key="sendIcon"
          accessibilityLabel={i18n.t("ran.chat.Send_message")}
          accessibilityTraits="button"
          onPress={() => this.submit(this.state.text)}
          testID="messagebox-send-message"
        />
      );
      return icons;
    }
    icons.push(
      <Icon
        style={[
          styles.actionButtons,
          { color: "#1D74F5", paddingHorizontal: 10 }
        ]}
        name="mic"
        key="micIcon"
        accessibilityLabel={i18n.t("ran.chat.Send_audio_message")}
        accessibilityTraits="button"
        onPress={() => this.recordAudioMessage()}
        testID="messagebox-send-audio"
      />
    );
    icons.push(
      <IconPlus
        style={[styles.actionButtons, { color: "#2F343D", fontSize: 16 }]}
        name="plus"
        key="fileIcon"
        accessibilityLabel={i18n.t("ran.chat.Message_actions")}
        accessibilityTraits="button"
        onPress={this.toggleFilesActions}
        testID="messagebox-actions"
      />
    );
    return icons;
  }

  getPermalink = async message => {
    try {
      return await RocketChat.getPermalink(message);
    } catch (error) {
      return null;
    }
  };

  toggleFilesActions = () => {
    this.setState(prevState => ({
      showFilesAction: !prevState.showFilesAction
    }));
  };

  sendImageMessage = async file => {
    this.setState({ filesaction: "" });
    const fileInfo = {
      name: file.name ? file.name : `${file.path.split("/").pop()}`,
      description: file.description,
      size: file.size,
      type: file.type ? file.type : "image/jpeg", //`image/${file.path.split(".").pop()}`,
      store: "Uploads",
      path: file.path,
      data: file.base64
    };
    try {
      await RocketChat.sendFileMessage(this.props.rid, fileInfo);
    } catch (e) {
      log("sendImageMessage", e);
    }
  };

  takePhoto = async () => {
    try {
      // const image = await ImagePicker.openCamera(imagePickerConfig);
      this.showUploadModal(image);
    } catch (e) {
      log("takePhoto", e);
    }
  };

  cameraRollPermission = async () => {
    const response = await Permissions.askAsync(Permissions.CAMERA_ROLL);
    return response.status === "granted";
  };

  chooseFromLibrary = async () => {
    try {
      // const image = await ImagePicker.openPicker(imagePickerConfig);
      const cameraRollPermission = await this.cameraRollPermission();
      if (cameraRollPermission) {
        // const image = await ImagePicker.launchImageLibraryAsync({
        //   allowsEditing: true,
        //   aspect: [4, 3],
        //   base64: true,
        //   exif: true
        // });
        // this.showUploadModal(image.uri);
        this.showUploadModal("chooseFromLibrary");
      }
    } catch (e) {
      log("chooseFromLibrary", e);
    }
  };

  showUploadModal = filesAction => {
    this.setState({ filesaction: filesAction });
    this.openModal();
  };

  editCancel() {
    this.props.editCancel();
    this.setState({ text: "" });
  }

  openEmoji() {
    Keyboard.dismiss();
    this.setState({
      showEmojiKeyboard: true
    });
  }

  async recordAudioMessage() {
    const recording = await Recording.permission();
    this.setState({ recording });
  }

  finishAudioMessage = async fileInfo => {
    this.setState({
      recording: false
    });
    if (fileInfo) {
      try {
        await RocketChat.sendFileMessage(this.props.rid, fileInfo);
      } catch (e) {
        if (e && e.error === "error-file-too-large") {
          return Alert.alert(i18n.t("ran.chat.error"));
        }
        log("finishAudioMessage", e);
      }
    }
  };

  closeEmoji() {
    this.setState({ showEmojiKeyboard: false });
  }

  async submit(message) {
    this.setState({ text: "" });
    this.closeEmoji();
    this.stopTrackingMention();
    this.props.typing(false);
    if (message.trim() === "") {
      return;
    }
    // if is editing a message
    const { editing, replying } = this.props;

    if (editing) {
      const { _id, rid } = this.props.message;
      this.props.editRequest({ _id, msg: message, rid });
    } else if (replying) {
      const { username, replyMessage, roomType, closeReply } = this.props;
      const permalink = await this.getPermalink(replyMessage);
      let msg = `[ ](${permalink}) `;

      // if original message wasn't sent by current user and neither from a direct room
      if (
        username !== JSON.parse(replyMessage.u).username &&
        roomType !== "d" &&
        replyMessage.mention
      ) {
        msg += `@${JSON.parse(replyMessage.u).username} `;
      }

      msg = `${msg} ${message}`;
      this.props.onSubmit(msg);
      closeReply();
    } else {
      // if is submiting a new message
      this.props.onSubmit(message);
    }
  }

  _getFixedMentions(keyword) {
    if ("all".indexOf(keyword) !== -1) {
      this.users = [{ _id: -1, username: "all" }, ...this.users];
    }
    if ("here".indexOf(keyword) !== -1) {
      this.users = [{ _id: -2, username: "here" }, ...this.users];
    }
  }

  async _getUsers(keyword) {
    this.users = await database.objects("users");
    if (keyword) {
      this.users = this.users.filtered("username CONTAINS[c] $0", keyword);
    }
    this._getFixedMentions(keyword);
    this.setState({ mentions: this.users.slice() });

    const usernames = [];

    if (keyword && this.users.length > 7) {
      return;
    }

    this.users.forEach(user => usernames.push(user.username));

    if (this.oldPromise) {
      this.oldPromise();
    }
    try {
      const results = await Promise.race([
        RocketChat.spotlight(keyword, usernames, { users: true }),
        new Promise((resolve, reject) => (this.oldPromise = reject))
      ]);
      if (results.users && results.users.length) {
        results.users.forEach(user => {
          database.create("users", user, true);
        });
      }
    } catch (e) {
      console.warn("spotlight canceled");
    } finally {
      delete this.oldPromise;
      let users = await database.objects("users", `WHERE username is not null`); //.filtered("username CONTAINS[c] $0", keyword)
      this.users = users.slice();
      this._getFixedMentions(keyword);
      this.setState({ mentions: this.users });
    }
  }

  async _getRooms(keyword = "") {
    this.roomsCache = this.roomsCache || [];
    this.rooms = await database.objects("subscriptions", `WHERE t != "d"`);
    if (keyword) {
      // this.rooms = this.rooms.filtered("name CONTAINS[c] $0", keyword);
    }

    const rooms = [];
    this.rooms.forEach(room => rooms.push(room));

    this.roomsCache.forEach(room => {
      if (
        room.name &&
        room.name.toUpperCase().indexOf(keyword.toUpperCase()) !== -1
      ) {
        rooms.push(room);
      }
    });

    if (rooms.length > 3) {
      this.setState({ mentions: rooms });
      return;
    }

    if (this.oldPromise) {
      this.oldPromise();
    }

    try {
      const results = await Promise.race([
        RocketChat.spotlight(
          keyword,
          [...rooms, ...this.roomsCache].map(r => r.name),
          { rooms: true }
        ),
        new Promise((resolve, reject) => (this.oldPromise = reject))
      ]);
      if (results.rooms && results.rooms.length) {
        this.roomsCache = [...this.roomsCache, ...results.rooms].filter(
          onlyUnique
        );
      }
      this.setState({ mentions: [...rooms.slice(), ...results.rooms] });
    } catch (e) {
      console.warn("spotlight canceled");
    } finally {
      delete this.oldPromise;
    }
  }

  _getEmojis(keyword) {
    if (keyword) {
      this.customEmojis = database.objects("customEmojis");
      // this.customEmojis = database
      //   .objects("customEmojis")
      //   .filtered("name CONTAINS[c] $0", keyword)
      //   .slice(0, 4);
      // this.emojis = emojis
      //   .filter(emoji => emoji.indexOf(keyword) !== -1)
      //   .slice(0, 4);
      const mergedEmojis = [...this.customEmojis, ...this.emojis];
      this.setState({ mentions: mergedEmojis });
    }
  }

  stopTrackingMention() {
    this.setState({
      mentions: [],
      trackingType: ""
    });
    this.users = [];
    this.rooms = [];
    this.customEmojis = [];
    this.emojis = [];
  }

  identifyMentionKeyword(keyword, type) {
    this.setState({
      showEmojiKeyboard: false,
      trackingType: type
    });
    this.updateMentions(keyword, type);
  }

  updateMentions = (keyword, type) => {
    if (type === MENTIONS_TRACKING_TYPE_USERS) {
      this._getUsers(keyword);
    } else if (type === MENTIONS_TRACKING_TYPE_EMOJIS) {
      this._getEmojis(keyword);
    } else {
      this._getRooms(keyword);
    }
  };

  _onPressMention(item) {
    const msg = this.component._lastNativeText;

    const { start, end } = this.component._lastNativeSelection;

    const cursor = Math.max(start, end);

    const regexp = /([a-z0-9._-]+)$/im;

    const result = msg.substr(0, cursor).replace(regexp, "");
    const mentionName =
      this.state.trackingType === MENTIONS_TRACKING_TYPE_EMOJIS
        ? `${item.name || item}:`
        : item.username || item.name;
    const text = `${result}${mentionName} ${msg.slice(cursor)}`;
    this.component.setNativeProps({ text });
    this.setState({ text });
    this.component.focus();
    requestAnimationFrame(() => this.stopTrackingMention());
  }
  _onEmojiSelected(keyboardId, params) {
    const { text } = this.state;
    const { emoji } = params;
    let newText = "";

    // if messagebox has an active cursor
    if (this.component._lastNativeSelection) {
      const { start, end } = this.component._lastNativeSelection;
      const cursor = Math.max(start, end);
      newText = `${text.substr(0, cursor)}${emoji}${text.substr(cursor)}`;
    } else {
      // if messagebox doesn't have a cursor, just append selected emoji
      newText = `${text}${emoji}`;
    }
    this.component.setNativeProps({ text: newText });
    this.setState({ text: newText });
  }
  renderFixedMentionItem = item => (
    <TouchableOpacity
      style={styles.mentionItem}
      onPress={() => this._onPressMention(item)}
    >
      <Text style={styles.fixedMentionAvatar}>{item.username}</Text>
      <Text>
        {item.username === "here"
          ? i18n.t("ran.chat.Notify_active_in_this_room")
          : i18n.t("ran.chat.Notify_all_in_this_room")}
      </Text>
    </TouchableOpacity>
  );
  renderMentionEmoji = item => {
    if (item.name) {
      return (
        <CustomEmoji
          key="mention-item-avatar"
          style={styles.mentionItemCustomEmoji}
          emoji={item}
          baseUrl={this.props.baseUrl}
        />
      );
    }
    return (
      <Text key="mention-item-avatar" style={styles.mentionItemEmoji}>
        {emojify(`:${item}:`, { output: "unicode" })}
      </Text>
    );
  };
  renderMentionItem = item => {
    if (item.username === "all" || item.username === "here") {
      return this.renderFixedMentionItem(item);
    }
    return (
      <TouchableOpacity
        style={styles.mentionItem}
        onPress={() => this._onPressMention(item)}
        testID={`mention-item-${
          this.state.trackingType === MENTIONS_TRACKING_TYPE_EMOJIS
            ? item.name || item
            : item.username || item.name
        }`}
      >
        {this.state.trackingType === MENTIONS_TRACKING_TYPE_EMOJIS
          ? [
              this.renderMentionEmoji(item),
              <Text key="mention-item-name">:{item.name || item}:</Text>
            ]
          : [
              <Avatar
                key="mention-item-avatar"
                style={{ margin: 8 }}
                text={item.username || item.name}
                size={30}
                type={item.username ? "d" : "c"}
                baseUrl={this.props.baseUrl}
              />,
              <Text key="mention-item-name">{item.username || item.name}</Text>
            ]}
      </TouchableOpacity>
    );
  };
  renderMentions = () => {
    const { mentions, trackingType } = this.state;
    if (!trackingType) {
      return null;
    }
    return (
      <View key="messagebox-container" testID="messagebox-container">
        <FlatList
          style={styles.mentionList}
          data={mentions}
          renderItem={({ item }) => this.renderMentionItem(item)}
          keyExtractor={item => item._id || item.username || item}
          keyboardShouldPersistTaps="always"
        />
      </View>
    );
  };

  renderReplyPreview = () => {
    const { replyMessage, replying, closeReply, username } = this.props;
    if (!replying) {
      return null;
    }
    return (
      <ReplyPreview
        key="reply-preview"
        message={replyMessage}
        close={closeReply}
        username={username}
      />
    );
  };

  renderFilesActions = () => {
    if (!this.state.showFilesAction) {
      return null;
    }
    return (
      <FilesActions
        key="files-actions"
        hideActions={this.toggleFilesActions}
        takePhoto={this.takePhoto}
        chooseFromLibrary={this.chooseFromLibrary}
      />
    );
  };

  // renderContent() {
  //   if (this.state.recording) {
  //     return <Recording onFinish={this.finishAudioMessage} />;
  //   }
  //   return [
  //     this.renderMentions(),
  //     <View style={styles.composer} key="messagebox">
  //       {this.renderReplyPreview()}
  //       <View
  //         style={[styles.textArea, this.props.editing && styles.editing]}
  //         testID="messagebox"
  //       >
  //         {this.leftButtons}
  //         <TextInput
  //           ref={component => (this.component = component)}
  //           style={styles.textBoxInput}
  //           returnKeyType="default"
  //           keyboardType="twitter"
  //           blurOnSubmit={false}
  //           placeholder={this.props.translate("ran.chat.New_Message")}
  //           onChangeText={text => this.onChangeText(text)}
  //           value={this.state.text}
  //           underlineColorAndroid="transparent"
  //           defaultValue=""
  //           multiline
  //           placeholderTextColor="#9EA2A8"
  //           testID="messagebox-input"
  //         />
  //         {this.rightButtons}
  //       </View>
  //     </View>
  //   ];
  // }

  onEmojiSelected = emoji => {
    this.setState({ text: this.state.text + emoji });
    // this.component.refs.composerRef.setText(this.state.text + emoji);
  };

  onContentSizeChange = size => {
    let composerHeight = Math.max(
      MIN_COMPOSER_HEIGHT,
      Math.min(MAX_COMPOSER_HEIGHT, size.height)
    );

    this.component.refs.composerRef.setComposerHeight(composerHeight);
  };

  openModal = () => {
    this.actionModalRef.openModal();
  };

  closeModal = () => {
    this.actionModalRef.closeModal();
  };

  render() {
    console.log("MessageBox");

    const inputToolbarProps = {
      placeholder: i18n.t("ran.chat.input"),
      // sendButtonLabel: this.props.translate("ran.chat.send"),
      text: this.state.text,
      leftButtons: this.leftButtons,
      rightButtons: this.rightButtons,
      onTextChanged: this.onChangeText,
      onContentSizeChange: this.onContentSizeChange,
      containerStyle: { marginBottom: this.state.inputToolbarFloatUp }
    };
    return [
      // <KeyboardAccessoryView
      //   key="input"
      //   renderContent={() => this.renderContent()}
      //   kbInputRef={this.component}
      //   kbComponent={this.state.showEmojiKeyboard ? "EmojiKeyboard" : null}
      //   onKeyboardResigned={() => this.onKeyboardResigned()}
      //   onItemSelected={this._onEmojiSelected}
      //   trackInteractive
      //   // revealKeyboardInteractive
      //   requiresSameParentToManageScrollView
      //   addBottomView
      // />,

      this.state.recording ? (
        <Recording onFinish={this.finishAudioMessage} />
      ) : (
        <InputToolbar
          ref={component => (this.component = component)}
          {...inputToolbarProps}
        />
      ),
      this.renderFilesActions(),
      <ActionModal ref={ref => (this.actionModalRef = ref)}>
        {this.state.filesaction === "chooseFromLibrary" ? (
          <MediaPicker
            closeModal={this.closeModal}
            onSend={this.sendImageMessage}
          />
        ) : null}
        {this.state.filesaction === "takePhoto" ? (
          <MediaPicker closeModal={this.closeModal} />
        ) : null}
      </ActionModal>,
      this.state.showEmojiKeyboard ? (
        <EmojiKeyboard
          key="emoji-keyboard"
          onEmojiSelected={this.onEmojiSelected}
        />
      ) : null
    ];
  }
}
