import mongoose from 'mongoose';
mongoose.connect('mongodb://127.0.0.1:55888/').then(async () => {
   const Room = mongoose.model('Room', new mongoose.Schema({ roomId: String, users: [{type: mongoose.Schema.Types.ObjectId, ref: 'User'}] }));
   const User = mongoose.model('User', new mongoose.Schema({ username: String, role: String, approvalStatus: String }));

   const rooms = await Room.find().populate('users');
   console.log(JSON.stringify(rooms, null, 2));

   const allUsers = await User.find();
   console.log("All Users:", JSON.stringify(allUsers, null, 2));
   process.exit(0);
});
