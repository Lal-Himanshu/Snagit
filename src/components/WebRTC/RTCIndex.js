import React, {useEffect, useRef} from 'react';

import {
  BackHandler,
  Button,
  KeyboardAvoidingView,
  SafeAreaView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import {
  RTCPeerConnection,
  RTCIceCandidate,
  RTCSessionDescription,
  RTCView,
  MediaStream,
  mediaDevices,
} from 'react-native-webrtc';
import {useState} from 'react';
import firestore from '@react-native-firebase/firestore';
import {Dimensions} from 'react-native';
import {COLORS} from '../../assets/theme';
import VectorIcon from '../../utils/VectorIcon';
import {useSelector} from 'react-redux';
import crashlytics from '@react-native-firebase/crashlytics';
import database from '@react-native-firebase/database';
const {width, height} = Dimensions.get('window');
const RTCIndex = ({route, navigation}) => {
  const userUID = useSelector(state => state.userToken.UID);

  const {clickedSellerDeviceToken} = route.params;

  const [remoteStream, setRemoteStream] = useState(null);

  const [webcamStarted, setWebcamStarted] = useState(false);
  const [localStream, setLocalStream] = useState(null);
  const [channelId, setChannelId] = useState(null);
  //  const [clickedSellerDeviceToken, setClickedSellerDeviceToken] =
  //    useState(null);
  const pc = useRef();
  const servers = {
    iceServers: [
      {
        urls: [
          'stun:stun1.l.google.com:19302',
          'stun:stun2.l.google.com:19302',
        ],
      },
    ],
    iceCandidatePoolSize: 10,
  };

  const startWebcam = async () => {
    try {
      const localStream = await mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

      setLocalStream(localStream);

      pc.current = new RTCPeerConnection(servers); // Ensure pc.current is properly initialized

      pc.current.onconnectionstatechange = event => {
        console.log('Connection state changed:', pc.current.connectionState);
        if (pc.current.connectionState === 'disconnected') {
          // Peer connection closed
          console.log('Peer connection disconnected.');
          // navigation.goBack();
          navigation.navigate('SellerScreen');
        } else if (pc.current.connectionState === 'closed') {
          console.log('Peer connection closed.');
          navigation.navigate('SellerScreen');
        }
      };

      // Add event listener for errors
      pc.current.onerror = error => {
        console.error('An error occurred:', error);
      };

      pc.current.ontrack = event => {
        event.streams.forEach(stream => {
          setRemoteStream(stream);
        });
      };

      localStream.getTracks().forEach(track => {
        pc.current.addTrack(track, localStream);
      });

      setWebcamStarted(true);
    } catch (error) {
      console.error('Error starting webcam:', error);
    }
  };
  // async function setDeviceToken(itemId) {
  //   await firestore()
  //     .collection('Sellers')
  //     .doc(itemId)
  //     .get()
  //     .then(doc => {
  //       if (doc.exists) {
  //         // Document data is available in doc.data()
  //         const sellerData = doc.data();
  //         // console.log('Seller Data:', sellerData.deviceToken);
  //         // sellerFcmToken = sellerData.deviceToken;
  //         setClickedSellerDeviceToken(sellerData.deviceToken);
  //       } else {
  //         console.log('No such document!');
  //       }
  //     })
  //     .catch(error => {
  //       console.error('Error getting seller document:', error);
  //     });
  // }
  async function handleCallNotification(channelId) {
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
    console.log('clickedSellerDeviceToken', clickedSellerDeviceToken);
    const message = {
      to: clickedSellerDeviceToken,
      notification: {
        title: '📲Fasto user Calling',
        body: '📞📞Call from a fasto user📞📞',
      },
      data: {
        channelId: `${channelId}`,
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
    await database()
      .ref(`/Sellers/${channelId}`)
      .set({
        callStatus: true,
      })
      .then(() => console.log('Data set------------>', channelId));
  }

  useEffect(() => {
    async function StartWebCamAwait() {
      await startWebcam();
    }
    StartWebCamAwait();
  }, []);
  const startCall = async () => {
    const channelDoc = firestore().collection('channels').doc();
    const offerCandidates = channelDoc.collection('offerCandidates');
    const answerCandidates = channelDoc.collection('answerCandidates');

    setChannelId(channelDoc.id);

    pc.current.onicecandidate = async event => {
      if (event.candidate) {
        await offerCandidates.add(event.candidate.toJSON());
      }
    };

    const offer = await pc.current.createOffer();
    await pc.current.setLocalDescription(offer);

    await channelDoc.set({offer: offer});

    // const unsubscribe = channelDoc.onSnapshot(snapshot => {
    //   const data = snapshot.data();
    //   if (data && data.seller === false) {
    //     endCall();
    //     unsubscribe();
    //   }
    // });

    channelDoc.onSnapshot(snapshot => {
      const data = snapshot.data();
      if (!pc.current.currentRemoteDescription && data?.answer) {
        const answerDescription = new RTCSessionDescription(data.answer);
        pc.current.setRemoteDescription(answerDescription);
      }
    });

    answerCandidates.onSnapshot(snapshot => {
      snapshot.docChanges().forEach(change => {
        if (change.type === 'added') {
          const data = change.doc.data();
          pc.current.addIceCandidate(new RTCIceCandidate(data));
        }
      });
    });
    // await channelDoc.update({
    //   user: true,
    //   seller: true,
    // });
    await handleCallNotification(channelDoc.id);
  };

  const joinCall = async () => {
    const channelDoc = firestore().collection('channels').doc(channelId);
    const offerCandidates = channelDoc.collection('offerCandidates');
    const answerCandidates = channelDoc.collection('answerCandidates');

    pc.current.onicecandidate = async event => {
      if (event.candidate) {
        await answerCandidates.add(event.candidate.toJSON());
      }
    };

    const channelDocument = await channelDoc.get();
    const channelData = channelDocument.data();

    const offerDescription = channelData.offer;

    await pc.current.setRemoteDescription(
      new RTCSessionDescription(offerDescription),
    );

    const answer = await pc.current.createAnswer();
    await pc.current.setLocalDescription(answer);

    await channelDoc.update({answer: answer});

    offerCandidates.onSnapshot(snapshot => {
      snapshot.docChanges().forEach(change => {
        if (change.type === 'added') {
          const data = change.doc.data();
          pc.current.addIceCandidate(new RTCIceCandidate(data));
        }
      });
    });
  };

  const endCall = async () => {
    // Close the peer connection and reset states
    if (pc.current) {
      pc.current.close();
    }
    await database()
      .ref(`/Sellers/${channelId}`)
      .update({
        callStatus: false,
      })
      .then(() => console.log('Data updated.'));
    setLocalStream(null);
    setRemoteStream(null);
    setChannelId(null);
    setWebcamStarted(false);
    // navigation.goBack();

    // if (channelId) {
    //   const channelDoc = firestore().collection('channels').doc(channelId);
    //   await channelDoc.update({
    //     user: false,
    //   });
    // }
  };

  useEffect(() => {
    const startCallAutomatically = async () => {
      await startWebcam();
      await startCall();
    };

    startCallAutomatically();
  }, []);

  useEffect(() => {
    const backAction = () => {
      console.log('Back button pressed');
      endCall();
      return true;
    };

    const backHandler = BackHandler.addEventListener(
      'hardwareBackPress',
      backAction,
    );

    return () => backHandler.remove(); // Remove the event listener on component unmount
  }, []);

  // Inside the RTCIndex component
  // useEffect(() => {
  //   startWebcam();

  //   // Initialize RTCPeerConnection and add event listeners
  //   pc.current = new RTCPeerConnection(servers);

  //   // Add event listener for connection state changes
  //   pc.current.onconnectionstatechange = event => {
  //     console.log('Connection state changed:', pc.current.connectionState);
  //     if (pc.current.connectionState === 'closed') {
  //       // Peer connection closed
  //       console.log('Peer connection closed.');
  //       // Perform any additional actions if needed
  //     }
  //   };

  //   // Add event listener for errors
  //   pc.current.onerror = error => {
  //     console.error('An error occurred:', error);
  //     // Handle error appropriately
  //   };

  //   // Cleanup function: remove event listeners on component unmount
  //   return () => {
  //     if (pc.current) {
  //       pc.current.onconnectionstatechange = null;
  //       pc.current.onerror = null;
  //     }
  //   };
  // }, []); // Empty dependency array ensures this effect runs only once, like componentDidMount

  // Add event listeners for connection state changes

  return (
    <KeyboardAvoidingView style={styles.body} behavior="position">
      <SafeAreaView style={styles.container}>
        {localStream && (
          <View
            style={remoteStream ? styles.joined : styles.localStreamContainer}>
            <RTCView
              streamURL={localStream?.toURL()}
              style={styles.stream}
              objectFit="cover"
              mirror
            />
          </View>
        )}

        {remoteStream && (
          <View style={styles.remoteStreamContainer}>
            <RTCView
              streamURL={remoteStream?.toURL()}
              style={styles.RemoteStream}
              objectFit="cover"
              mirror
            />
          </View>
        )}
        <View style={styles.buttons}>
          {/* {!webcamStarted && (
            <Button title="Start webcam" onPress={startWebcam} />
          )} */}
          {/* {webcamStarted && <Button title="Start call" onPress={startCall} />} */}
          {webcamStarted && (
            <View
              style={{
                flexDirection: 'row',
                marginBottom: 10,
                alignSelf: 'center',
              }}>
              {/* <Button title="Join call" onPress={joinCall} /> */}
              {/* <TextInput
                value={channelId}
                placeholder="callId"
                minLength={45}
                style={{borderWidth: 1, padding: 5}}
                onChangeText={newText => setChannelId(newText)}
              /> */}
              <VectorIcon
                name={'closecircle'}
                type={'AntDesign'}
                size={50}
                color={'red'}
                onPress={endCall}
              />
            </View>
          )}
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  body: {
    backgroundColor: COLORS.secondaryButtonColor,
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: width,
    height: height,
  },
  container: {
    width: width,
    height: height,
    zIndex: 1,
    marginTop: width * 0.05,
  },
  joined: {
    flex: 1,
    margin: 10,
    width: width * 0.95,
    height: height,
    borderRadius: 18,
    overflow: 'hidden',
  },
  localStreamContainer: {
    flex: 1,
    margin: 10,
    borderRadius: 15,
    width: width * 0.95,
    height: height,
    borderRadius: 18,
    overflow: 'hidden',
  },
  stream: {
    flex: 1,
  },
  remoteStreamContainer: {
    flex: 1,
    margin: 10,
    width: width * 0.95,
    height: height,
    borderRadius: 18,
    overflow: 'hidden',
  },
  RemoteStream: {
    flex: 1,
  },
  buttons: {
    alignItems: 'flex-start',
    flexDirection: 'column',
  },
});

export default RTCIndex;
