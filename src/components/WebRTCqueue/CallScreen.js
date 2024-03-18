import React, {useState, useEffect} from 'react';
import {
  Text,
  StyleSheet,
  Button,
  View,
  TouchableOpacity,
  Image,
} from 'react-native';

import {
  RTCPeerConnection,
  RTCView,
  mediaDevices,
  RTCIceCandidate,
  RTCSessionDescription,
} from 'react-native-webrtc';
// import {db} from '../utilities/firebase';
import firestore from '@react-native-firebase/firestore';
import database from '@react-native-firebase/database';
import {useSelector} from 'react-redux';
import muteMicrophoneImage from '../../assets/images/mute-microphone.png';
import microphoneImage from '../../assets/images/microphone.png';
const configuration = {
  iceServers: [
    {
      urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
    },
  ],
  iceCandidatePoolSize: 10,
};

export default function CallScreen({setScreen, screens, roomId, navigation}) {
  const userUID = useSelector(state => state.userToken.UID);
  async function onBackPress(id) {
    if (cachedLocalPC) {
      localStream.getTracks().forEach(track => {
        track.stop();
      });
      cachedLocalPC.close();
    }
    setLocalStream();
    setRemoteStream();
    setCachedLocalPC();
    try {
      console.log('inside endCall try');
      await database().ref(`/Sellers/${id}`).update({
        userCallStatus: false,
      });
      console.log('after endCall try');
      console.log('Data updated.', roomId);
    } catch (error) {
      console.error('Error updating data:', error);
    }
    navigation.navigate('SellerScreen');
  }

  const [localStream, setLocalStream] = useState();
  const [remoteStream, setRemoteStream] = useState();
  const [cachedLocalPC, setCachedLocalPC] = useState();
  const [channelId, setChannelId] = useState();
  const [isMuted, setIsMuted] = useState(false);

  const startLocalStream = async () => {
    const isFront = true;
    const devices = await mediaDevices.enumerateDevices();

    const facing = isFront ? 'front' : 'environment';
    const videoSourceId = devices.find(
      device => device.kind === 'videoinput' && device.facing === facing,
    );
    const facingMode = isFront ? 'user' : 'environment';
    const constraints = {
      audio: true,
      video: {
        mandatory: {
          minWidth: 500, // Provide your own width, height and frame rate here
          minHeight: 300,
          minFrameRate: 30,
        },
        facingMode,
        optional: videoSourceId ? [{sourceId: videoSourceId}] : [],
      },
    };
    const newStream = await mediaDevices.getUserMedia(constraints);
    setLocalStream(newStream);
  };
  async function handleCallNotification(id) {
    // const message = {
    //   to: clickedSellerDeviceToken,
    //   notification: {
    //     title: '📲Fasto user Calling',
    //     body: '📞📞Call from a fasto user📞📞',
    //   },
    //   data: {
    //     // You can include additional data if needed
    //     // ...
    //     channelId: channelId,
    //   },
    // };
    console.log('clickedSellerDeviceToken', id);
    const message = {
      to: roomId,
      notification: {
        title: '📲Fasto user Calling',
        body: '📞📞Call from a fasto user📞📞',
      },
      data: {
        channelId: `${id}`,
        userUID: userUID,
        // Add more key-value pairs as needed
      },
    };

    await fetch('https://fcm.googleapis.com/fcm/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization:
          'key=AAAArsiGfCg:APA91bG4MQ_kSTeuCFZDjEkStvHn_zBJ_WmyTLzUg9C7sPmy3THk7s8XnoyhSjrhZ6X_X7VRGPpO_yCFXJ2AYYUEPUWoPV6Lm7jZ28BQ4mQKeoDM8SsrgnE73VdfelwDG9S9ywP5La8F', // Replace with your server key
      },
      body: JSON.stringify(message),
    });

    try {
      console.log('inside endCall try');
      const roomRef = database().ref(`/Sellers/${id}`);
      // Check if the room already exists
      roomRef.once('value', async snapshot => {
        if (snapshot.exists()) {
          // If room exists, update its data
          await roomRef.update({
            userCallStatus: 'truing',
            sellerCallStatus: 'something',
          });
          console.log('Data updated------------>', id);
        } else {
          // If room doesn't exist, set its data
          await roomRef.set({
            userCallStatus: 'setting tr',
            sellerCallStatus: 'settin some',
          });
          console.log('Data set------------>', id);
        }
      });
      console.log('after endCall try');
    } catch (error) {
      console.error('Error updating data:', error);
    }
  }
  const startCall = async id => {
    const localPC = new RTCPeerConnection(configuration);
    // localPC.addStream(localStream);
    localStream.getTracks().forEach(track => {
      localPC.addTrack(track, localStream);
    });
    localPC.onerror = error => {
      console.error('An error occurred:', error);
    };

    const roomRef = await firestore().collection('rooms').doc();
    setChannelId(roomRef.id);
    handleCallNotification(roomRef.id);
    const unsubscribe = database()
      .ref(`/Sellers/${roomRef.id}`)
      .on('value', snapshot => {
        // This callback will be invoked whenever the data at the specified reference changes
        const data = snapshot?.val();
        // You can access and handle the updated data here
        if (data?.sellerCallStatus === false) {
          onBackPress(roomRef.id);
        }
        console.log('Data updated:', data);
      });
    const callerCandidatesCollection = roomRef.collection('callerCandidates');
    localPC.onicecandidate = e => {
      if (!e.candidate) {
        console.log('Got final candidate!');
        return;
      }
      callerCandidatesCollection.add(e.candidate.toJSON());
    };

    localPC.ontrack = event => {
      event.streams.forEach(stream => {
        setRemoteStream(stream);
      });
    };

    const offer = await localPC.createOffer();
    await localPC.setLocalDescription(offer);

    const roomWithOffer = {offer};
    await roomRef.set(roomWithOffer);

    // roomRef.onSnapshot(async snapshot => {
    //   const data = snapshot.data();
    //   if (!localPC.currentRemoteDescription && data?.answer) {
    //     const answerDescription = new RTCSessionDescription(data.answer);
    //     console.log('🚀 ~ startCall ~ answerDescription:', answerDescription);

    //     await localPC.setRemoteDescription(answerDescription);
    //   }
    // });

    roomRef.onSnapshot(async snapshot => {
      const data = snapshot.data();
      if (data) {
        if (!localPC.currentRemoteDescription && data.answer) {
          const answerDescription = new RTCSessionDescription(data.answer);
          console.log('🚀 ~ startCall ~ answerDescription:', answerDescription);
          await localPC.setRemoteDescription(answerDescription);
        }
      }
    });

    roomRef.collection('calleeCandidates').onSnapshot(snapshot => {
      snapshot.docChanges().forEach(async change => {
        if (change.type === 'added') {
          let data = change.doc.data();
          await localPC.addIceCandidate(new RTCIceCandidate(data));
        }
      });
    });

    setCachedLocalPC(localPC);
  };

  const switchCamera = () => {
    localStream.getVideoTracks().forEach(track => track._switchCamera());
  };

  // Mutes the local's outgoing audio
  const toggleMute = () => {
    if (!remoteStream) {
      return;
    }
    localStream.getAudioTracks().forEach(track => {
      // console.log(track.enabled ? 'muting' : 'unmuting', ' local track', track);
      track.enabled = !track.enabled;
      setIsMuted(!track.enabled);
    });
  };

  return (
    <>
      {/* <Text style={styles.heading}>Call Screen</Text> */}
      {/* <Text style={styles.heading}>Room : {roomId}</Text> */}

      <View style={styles.callButtons}>
        <View styles={styles.buttonContainer}>
          <TouchableOpacity onPress={() => onBackPress(channelId)}>
            <Image
              style={{width: 50, height: 50}}
              source={require('../../assets/images/delete-button.png')}
            />
          </TouchableOpacity>
          {/* <Button
            title="Click to stop call"
            onPress={() => onBackPress(channelId)}
          /> */}
        </View>
        <View styles={styles.buttonContainer}>
          {!localStream && (
            <Button title="Click to start stream" onPress={startLocalStream} />
          )}
          {localStream && (
            <Button
              title="Click to start call"
              onPress={() => startCall(roomId)}
              disabled={!!remoteStream}
            />
          )}
        </View>
      </View>

      {localStream && (
        <View style={styles.toggleButtons}>
          <TouchableOpacity onPress={switchCamera}>
            <Image
              style={{width: 50, height: 50}}
              source={require('../../assets/images/switch-camera.png')}
            />
          </TouchableOpacity>
          {/* <Button title="Switch camera" onPress={switchCamera} /> */}
          <TouchableOpacity onPress={toggleMute}>
            <Image
              style={{width: 50, height: 50}}
              source={isMuted ? muteMicrophoneImage : microphoneImage}
            />
          </TouchableOpacity>
          {/* <Button
            title={`${isMuted ? 'Unmute' : 'Mute'} stream`}
            onPress={toggleMute}
            disabled={!remoteStream}
          /> */}
        </View>
      )}

      <View style={{display: 'flex', flex: 1, padding: 10}}>
        <View style={styles.rtcview}>
          {localStream && (
            <RTCView
              style={styles.rtc}
              streamURL={localStream && localStream.toURL()}
            />
          )}
        </View>
        <View style={styles.rtcview}>
          {remoteStream && (
            <RTCView
              style={styles.rtc}
              streamURL={remoteStream && remoteStream.toURL()}
            />
          )}
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  heading: {
    alignSelf: 'center',
    fontSize: 30,
  },
  rtcview: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'black',
    margin: 5,
  },
  rtc: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  toggleButtons: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  callButtons: {
    padding: 10,
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  buttonContainer: {
    margin: 5,
  },
});
