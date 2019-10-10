const functions = require("firebase-functions");
const app = require("express")();
const FBAuth = require("./util/FBAuth");
const { db } = require('./util/admin');

const cors = require('cors');
app.use(cors());


const { 
    getAllScreams,
     postOneScream,
     getScream,
     commentOnScream,
     likeScream,
     unlikeScream,
     deleteScream,
     postImage
} = require("./handlers/screams");

const {
  signup,
  login,
  uploadImage,
  addUserDetails,
  getAuthenticatedUser,
  getUserDetails,
  markNotificationRead
} = require("./handlers/users");



//Scream Routes
app.get("/screams", getAllScreams); //get all screams from db
app.post("/scream", FBAuth, postOneScream); //post one scream
app.get("/scream/:screamId", getScream); //get specific scream
app.delete("/scream/:screamId",FBAuth, deleteScream); //delete specific scream
app.get("/scream/:screamId/like", FBAuth, likeScream); //like specific scream
app.get("/scream/:screamId/unlike", FBAuth, unlikeScream); //unlike specific cream
app.post("/scream/:screamId/comment", FBAuth, commentOnScream) //comment on a specific scream
app.post('/scream/:screamId',FBAuth, postImage); //upload image to a post 

//User Routes
app.post("/signup", signup); 
app.post("/login", login);
app.post("/user/image", FBAuth, uploadImage); //upload user image 
app.post("/user", FBAuth, addUserDetails); //add user details
app.get("/user", FBAuth, getAuthenticatedUser); //get current logged in user data
app.get("/user/:handle", getUserDetails) //get any user details
app.post("/notifications",FBAuth, markNotificationRead)


//this is to tell firebase that we're using express
exports.api = functions.region('us-central1').https.onRequest(app);


exports.createNotificationOnLike = functions
  .region('us-central1')
  .firestore.document('likes/{id}')
  .onCreate((snapshot) => {
    return db
      .doc(`/screams/${snapshot.data().screamId}`)
      .get()
      .then((doc) => {
        if (
          doc.exists &&
          doc.data().userHandle !== snapshot.data().userHandle // make sure that user doesn't get notification from him/her self
        ) {
          return db.doc(`/notifications/${snapshot.id}`).set({
            createdAt: new Date().toISOString(),
            recipient: doc.data().userHandle,
            sender: snapshot.data().userHandle,
            type: 'like',
            read: false,
            screamId: doc.id
          });
        }
      })
      .catch((err) => console.error(err));
  });


exports.deleteNotificationOnUnLike = functions
  .region('us-central1')
  .firestore.document('likes/{id}')
  .onDelete((snapshot) => {
    return db
      .doc(`/notifications/${snapshot.id}`)
      .delete()
      .catch((err) => {
        console.error(err);
        return;
      });
  });


exports.createNotificationOnComment = functions
  .region('us-central1')
  .firestore.document('comments/{id}')
  .onCreate((snapshot) => {
    return db
      .doc(`/screams/${snapshot.data().screamId}`)
      .get()
      .then((doc) => {
        if (
          doc.exists &&
          doc.data().userHandle !== snapshot.data().userHandle
        ) {
          return db.doc(`/notifications/${snapshot.id}`).set({
            createdAt: new Date().toISOString(),
            recipient: doc.data().userHandle,
            sender: snapshot.data().userHandle,
            type: 'comment',
            read: false,
            screamId: doc.id
          });
        }
      })
      .catch((err) => {
        console.error(err);
        return;
      });
  });


  //make sure that image changes in comment when user change his/her image
  exports.onUserImageChange = functions
  .region('us-central1')
  .firestore.document('/users/{userId}')
  .onUpdate((change) => {
    if (change.before.data().imageUrl !== change.after.data().imageUrl) {
      const batch = db.batch();
      return db
        .collection('screams')
        .where('userHandle', '==', change.before.data().handle)
        .get()
        .then((data) => {
          data.forEach((doc) => {
            const scream = db.doc(`/screams/${doc.id}`);
            batch.update(scream, { userImage: change.after.data().imageUrl });
          });
          return batch.commit();
        });
    } else return true;
  });
  
  exports.onScreamDelete = functions
  .region('us-central1')
  .firestore.document('/screams/{screamId}')
  .onDelete((snapshot, context) => {
    const screamId = context.params.screamId;
    const batch = db.batch();
    return db
      .collection('comments')
      .where('screamId', '==', screamId)
      .get()
      .then((data) => {
        data.forEach((doc) => {
          batch.delete(db.doc(`/comments/${doc.id}`));
        });
        return db
          .collection('likes')
          .where('screamId', '==', screamId)
          .get();
      })
      .then((data) => {
        data.forEach((doc) => {
          batch.delete(db.doc(`/likes/${doc.id}`));
        });
        return db
          .collection('notifications')
          .where('screamId', '==', screamId)
          .get();
      })
      .then((data) => {
        data.forEach((doc) => {
          batch.delete(db.doc(`/notifications/${doc.id}`));
        });
        return batch.commit();
      })
      .catch((err) => console.error(err));
  });