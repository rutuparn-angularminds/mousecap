const { ExpressService } = require("./services/express.service.js");
const express = require("express");
const cors = require("cors");
const app = express();
const multer  = require('multer');
const upload = multer({ dest: `${__dirname}/assets/` });

app.use(cors());
app.use(express.json({size : "5000kb"}));

const expressService = new ExpressService(
	app.listen(8080, (error) => {
	if(error)
		console.log(error);
}));

app.post("/login", expressService.login);
app.post("/register", expressService.register);
app.delete("/delete/:id", expressService.delete);

app.get("/groups", expressService.checkAuthorization, expressService.groups);
app.get("/group/:id", expressService.checkAuthorization, expressService.group);

app.get("/self", expressService.self);

app.post("/group/:id", upload.fields([{ name : "attachment", maxCount : 1}]), expressService.addNewMessage);

app.post("/group/:id/delete/message", expressService.deleteMessage);

app.patch("/group/:id/modify/reaction", expressService.reaction);

app.get("/set-invite-code/:id",expressService.checkAuthorization, expressService.setInviteCode);

app.get("/org-users/:id", expressService.getAllUsers);

app.post("/profile/chats", expressService.getChats);

app.patch("/settings/update-user/:id", expressService.updateUser);

app.post("/settings/create-group", expressService.createGroup);

app.patch("/chats/make-admin/:id", expressService.modifyAdmin);

app.patch("/chat/update-profile/:id", expressService.updateProfile);

app.patch("/chat/add-users/:id", expressService.addUsersToGroup);

app.patch("/chat/remove-users/:id", expressService.removeUsersFromGroup);