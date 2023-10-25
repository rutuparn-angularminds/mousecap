const mongoClient = require("mongodb").MongoClient ;
var { ObjectId } = require("mongodb");
var io = require('socket.io');
var mongodbData = require('../extra-data/mongodb.json');

class DatabaseService {

	db ;
	stream ;
	socket ;
	frontEndData ;

	constructor(server) {
		this.registerDatabase();
		io(server, {
			cors: {
	      origin: '*'
	    }
		}).on('connection', (socket) =>
		{
			this.socket = socket ;
			this.socket.emit('get-front-end-data', null);
			this.socket.on('set-front-end-data', data =>
			{
				this.frontEndData = { ...this.frontEndData, ...data};
			});
		});
	}

	async registerDatabase() {
	  if(this.db) {
	  	this.db = null ;
	  	this.stream.close();
	  }
	  	
	  this.db = await new mongoClient(mongodbData['atlas-link']).db(mongodbData['db']);
		// this.db.collection(mongodbData['users-collection']).deleteMany({});
		// this.db.collection(mongodbData['chats-collection']).deleteMany({});
		this.stream = this.db.collection(mongodbData['chats-collection']).watch();
		this.stream.on("change", async(next) => {
			if(next.operationType == 'insert') {
				let data = (await (this.fetchGroups(this.frontEndData.userId, {_id : next.documentKey._id})));
				if(data.length != 0)
					this.socket.emit('new-collection', data[0]);
			}

			else if(next.operationType == 'update') {
				let payload = {};
				payload.key = Object.keys(next.updateDescription.updatedFields)[0];
				payload.data = next.updateDescription.updatedFields[payload.key];
				payload.data = payload.key == 'messages' ? payload.data[0] : payload.data;
				let arr = [];
				let i = 0 ;
				let str = '';
				while(i < (payload.key+'.').length) {
					if((payload.key+'.').charAt(i) == '.') {
						arr.push(str);
						str = '';
						i++;
					}
					str += (payload.key+'.').charAt(i++);
				}
				if(this.socket) {
					let data ;
					if(arr[0] == 'messages') {
						if((arr.length == 1 || arr.length == 2) && typeof parseInt(arr[1]) == typeof 1) {
							delete payload.data.isDeleted;
							if(payload.data.to)
								payload.data.to = (await (this.db.collection(mongodbData['chats-collection']).aggregate([{$match : {_id:next.documentKey._id}}, {$project:{_id:0, messages:{$first:{$slice:['$messages',{$toInt:payload.data.to},1]}}}}])).toArray())[0].messages;
							data = {operation:'add-message', data : payload.data};
						}

						else if(arr.length == 3 && typeof parseInt(arr[1]) == typeof 1 && arr[2] == 'isDeleted') {
							data = {operation:'delete-message', data : payload.data, mIndex: arr[1]};
						}

						else if((arr.length == 3 || arr.length == 4) && typeof parseInt(arr[1]) == typeof 1 && arr[2] == 'reactions') {
							data = {operation:'single-reacted', push:(arr.length==4 || false), data : payload.data, mIndex : arr[1]};
						}

						else if((arr.length == 5 || arr.length == 6) && typeof parseInt(arr[1]) == typeof 1
							     && arr[2] == 'reactions' && typeof parseInt(arr[3]) == typeof 1 && arr[4] == 'from') {
							data = {operation:'mutliple-reacted', assign : (arr.length == 5 || false), data:payload.data,  mIndex:arr[1], rIndex:parseInt(arr[3])};
						}
					}

					else if(arr[0] == 'name') {
						data = {operation : 'update-profile', data : payload.data, _id:next.documentKey._id.toString()}
					}

					else if(arr[0] == 'users') {
						if(arr.length == 1)
							data = {operation : 'group-user-added', data : await this.fetchGroupUsers(next.documentKey._id.toString())};
						else if(typeof parseInt(arr[1]) == typeof 1 && arr[2] == 'isAdmin')
							data = {operation : 'modify-admin',index:parseInt(arr[1]), data:payload.data};
						else if(typeof parseInt(arr[1]) == typeof 1 && arr[2] == 'isRemoved')
							data = {operation : 'modify-single-user',index:parseInt(arr[1]), data:payload.data};
					}

					if(this.frontEndData.chatId == next.documentKey._id.toString())
						this.socket.emit("data",data);

					else if((await (this.verifyUserInGroup({'users._id' : this.frontEndData.userId, _id : next.documentKey._id})))) {
						switch(data.operation) {
							case 'add-message' :
								data = {
									_id : next.documentKey._id.toString(),
									data : {
										data : data.data.data,
										from : (await this.getUserCustomData([{$match:{_id:new ObjectId(data.data?.from)}}, {$project : {_id:0,name:1}}]))[0]?.name,
										to : (await this.getUserCustomData([{$match:{_id:new ObjectId(data.data?.to?.from)}}, {$project : {_id:0,name:1}}]))[0]?.name || null
									},
									operation : 'new-message'
								};

								if(!data.data.to)
									delete data.data.to ;
								this.socket.emit("notification", data);
								break ;
							default : break ;
						}
					}
				}
			}
		});
	};

	async getUserCustomData(pipeline = []) {
		return (await this.db.collection(mongodbData['users-collection']).aggregate(pipeline).toArray());
	}

	getUsers() {
		return this.db.collection(mongodbData['users-collection']).find().toArray();
	};

	fetchUser(email) {
		return this.db.collection(mongodbData['users-collection']).aggregate([{$match : {email : email, deleted : false}}]).toArray();
	}

	fetchSingleUser(email) {
		return this.db.collection(mongodbData['users-collection']).findOne({email : email});
	}

	setNewUser(payload) {
		return this.db.collection(mongodbData['users-collection']).insertOne(payload);
	}

	removeUser(_id) {
		return this.db.collection(mongodbData['users-collection']).updateOne({_id : new ObjectId(_id)}, {$set : {deleted : true}});
	}

	verifyUserInGroup(schema = {}, schema2 = null) {
		return new Promise((resolve, reject) =>
		{
			this.db.collection(mongodbData['chats-collection']).findOne({...schema}).then(
			RESOLVE =>
			{
				resolve(RESOLVE ? true : false);
			},
			REJECT =>
			{
				reject(false);
			});
		});
	}

	fetchGroupUsers(chatId, extraSchema = null) {
		return new Promise((resolve, reject) =>
		{
			this.db.collection(mongodbData['chats-collection']).aggregate([
				{ $match : { _id : new ObjectId(chatId) }}
			  ,{ $unwind : '$users'}
			  ,{ $replaceWith : {$setField : {field : 'users', input:'$$CURRENT', value : {$setField : {field : '_id', input:'$users', value : {$toObjectId : '$users._id'}}}}}}
			  ,{$lookup : {from : mongodbData['users-collection'], localField : 'users._id', foreignField : '_id', as:'xyz'}}
			  ,{$replaceWith : {$setField : {field:'xyz', input:'$$CURRENT', value:{$first:'$xyz'}}}}
			  ,{$group : {_id : '$_id', users : {$push : {$mergeObjects : ['$users',{name : '$xyz.name'}]}}}}
			  ,{$project : {_id:0}}
			]).toArray().then(
			RESOLVE =>
			{
				let users = {};
				for(let index of RESOLVE[0].users) {
					users[index._id] = index ;
					delete users[index._id]._id;
				}
				resolve({...RESOLVE[0], users : users});
			},
			REJECT =>
			{
				reject(REJECT);
			});
		});
	}

	fetchGroups(_id, extraSchema = null) {
		return this.db.collection(mongodbData['chats-collection']).aggregate([
		  {$match : {'users._id' : _id, ...extraSchema}}
		  ,{$replaceWith : {$setField : {field:'xyz', input:'$$CURRENT', value : {$first:{$slice:['$users',{$indexOfArray : ['$users._id', _id]},1]}}}}}
		  ,{$match : {$or:[{'xyz.isRemoved':null},{'xyz.isRemoved':false}]}}
		  ,{$unwind : '$users'}
		  ,{$replaceWith : {$setField:{field:'users', input:'$$CURRENT', value:{$setField:{field:'_id', input:'$users', value:{$toObjectId:'$users._id'}}}}}}
		  ,{$lookup : {from:mongodbData['users-collection'], localField:'users._id', foreignField:'_id', as:'xyz'}}
			,{$unwind : '$xyz'}
			,{$group : {_id : '$_id',createdAt:{$first:'$createdAt'},type:{$first:'$type'},f1:{$first:{$cond:['$name',true,false]}}, name : {$push : {$cond:['$name', '$name', {$cond:[{$eq:['$users._id','$xyz._id']},'$xyz.name','$$REMOVE']}]}}}}
			,{$replaceWith:{$setField:{field:'name', input:'$$CURRENT', value:{$cond:['$f1',[{$first:'$name'}],'$name']}}}}
			,{$project:{f1:0}}
		  ]).toArray();
	}

	fetchGroup(_userId, _groupId, messageSection) {
		messageSection = parseInt(messageSection ? messageSection : '0');
		let messagePerLoad = 7 ;
		let payload = {_id : (messageSection == 0 ? 1 : 0)} ;
		if(messageSection == 0) {
			payload = {
				...payload,
				name : 1,
				users : 1,
				createdAt : 1,
				type : 1
			}
		};

		return new Promise((resolve, reject) =>
		{
     this.db.collection(mongodbData['chats-collection']).aggregate([
     	 {$match : {_id : new ObjectId(_groupId), 'users._id' : _userId}}
     	 ,{$replaceWith : {$setField : {field:'xyz', input:'$$CURRENT', value : {$first:{$slice:['$users',{$indexOfArray : ['$users._id', _userId]},1]}}}}}
		   ,{$match : {$or:[{'xyz.isRemoved':null},{'xyz.isRemoved':false}]}}
    	 ,{$replaceWith : {$setField : {field:'xyz', input:'$$CURRENT', value : '$messages'}}}
       ,{$unwind : {path : '$messages', preserveNullAndEmptyArrays : true}}
       ,{$replaceWith : {$setField : {field:'messages', input:'$$CURRENT', value : {$cond:['$messages', '$messages', {}]}}}}
       ,{$replaceWith : {$setField : {field:'messages', input:'$$CURRENT', value : {$setField : {field : 'to', input:'$messages', value : {$cond : ['$messages.to', {$first : {$cond:['$messages.to',{$slice:['$xyz', {$toInt : '$messages.to'}, 1]},'$$REMOVE']}},'$$REMOVE']}}}}}}
       ,{$group : {_id : '$_id', type:{$first : '$type'}, users:{$first : '$users'}, name:{$first : '$name'} , createdAt:{$first : '$createdAt'}, messages : {$push : {$cond : [{$or:['$messages.isDeleted', {$eq:['$messages',{}]}]}, '$$REMOVE', '$messages']}}}}
       ,{$project : {'messages.isDeleted' : 0, 'messages.to.isDeleted' : 0, 'messages.to.reactions' : 0, 'messages.to.sentAt' : 0}}
       ,{$unwind : '$users'}
       ,{$replaceWith : {$setField : {field : 'uz', input:'$$CURRENT', value : '$users'}}}
       ,{$replaceWith : {$setField : {field : 'users', input : '$$CURRENT',  value : {$setField : {field:'_id', input:'$users', value:{$toObjectId : '$users._id'}}}}}}
       ,{$replaceWith : {$setField : {field : 'v1', input:'$$CURRENT', value : {$subtract:[{$size:'$messages'},{$multiply:[messagePerLoad,messageSection+1]}]}}}}
       ,{$replaceWith : {$setField : {field : 'v2', input:'$$CURRENT', value : {$add:[messagePerLoad,'$v1']}}}}
       ,{$lookup : {from:mongodbData['users-collection'], localField:'users._id', foreignField:'_id', as : 'users'}}
       ,{$replaceWith : {$setField : {field : 'users', input : '$$CURRENT', value : {_id : {$first:'$users._id'}, isAdmin:'$uz.isAdmin', isRemoved:'$uz.isRemoved', name : {$first:'$users.name'}}}}}
       ,{$group : { _id : '$_id', createdAt : {$first : '$createdAt'}, messages : {$first : {$cond:[{$gt:['$v2',0]},{$slice:['$messages', {$cond:[{$lt:['$v1',0]},0,'$v1']}, '$v2']},[]]}}, type:{$first : '$type'}, users:{$push : '$users'}, name:{$first : '$name'}}}
       ,{$project : {...payload, messages:1, lastPack:{$cond:[{$lt:[{$size:'$messages'},messagePerLoad]},true,'$$REMOVE']}}}
    	]).toArray().then(
			async(RESOLVE) =>
			{
				if(RESOLVE.length == 0)
					reject({databaseError : "No Chats Found"});
			  
			  else if(messageSection == 0)
						RESOLVE[0].users = (await (this.fetchGroupUsers(_groupId))).users ;
			  resolve(RESOLVE[0]);
			},
			REJECT =>
			{
			  reject(REJECT);
			});
		});
	}

	async addNewMessage(_id, payload) {
		payload = { ...payload, ...(await this.db.collection(mongodbData['chats-collection']).aggregate([{$match:{ _id : new ObjectId(_id) }},{$project:{_id:0, index:{$toString:{$size:'$messages'}}}}]).toArray())[0]};
		return this.db.collection(mongodbData['chats-collection']).updateOne({ _id : new ObjectId(_id) },{ $push : { messages : payload } });
	}

	selfCall(payload) {
		return this.db.collection(mongodbData['users-collection']).aggregate(
			[ {$match : payload}
			  ,{$replaceWith : {$setField : {field : '_org', input : '$$CURRENT', value : {$cond : ['$_org', {$toObjectId : '$_org'}, '$$REMOVE']}}}}
		      ,{$project : {password : 0, deleted : 0}}
		      ,{$lookup : {from:mongodbData['users-collection'], localField : '_org', foreignField : '_id', as : '_org'}}
		      ,{$replaceWith : {$setField : {field : '_org', input : '$$CURRENT', value : {$cond : [{$eq : [{$size : '$_org'},0]}, '$$REMOVE', {$first : '$_org'}]}}}}
		      ,{$project : {'_org.password' : 0, '_org.deleted' : 0, '_org.type' : 0}}
			]).toArray();
	}

	deleteMessage(_id, index) {
		return this.db.collection(mongodbData['chats-collection']).updateOne({_id : new ObjectId(_id)},{
			$set : {[`messages.${index}.isDeleted`] : true}
		});
	}

	react(_id, payload) {
		return new Promise(async(RESOLVE,REJECT) =>
		{
			let key = `messages.${payload.mIndex}.reactions` ;
			let schema = {
				_id : new ObjectId(_id),
				[key] : {$exists:true}
			};

			let updateSchema = {};
			let data = (await (this.db.collection(mongodbData['chats-collection']).findOne(schema)));
			delete schema[key];
			if(data == null) {
				updateSchema = {$set : {[key]:[{from:[payload._id], reaction:payload.reaction}]}};
				data = (await (this.db.collection(mongodbData['chats-collection']).updateOne(schema, updateSchema)));
				// console.log("Line 175",data);
			}
			else {
				schema[`${key}.reaction`] = payload.reaction ;
				data = (await (this.db.collection(mongodbData['chats-collection']).findOne(schema)));
				if(data) { //Reaction already present
					schema[`${key}.${payload.rIndex}.from`] = {$all:[payload._id]} ;
					data = (await (this.db.collection(mongodbData['chats-collection']).findOne(schema)));
					if(data) {
						updateSchema = {$pull : {[`${key}.$.from`] : payload._id}};
						schema[`${key}.${payload.rIndex}.from`] = {$size : 1};
						data = (await (this.db.collection(mongodbData['chats-collection']).findOne(schema)));
						if(data)
							updateSchema = {'$pull' : {[key] : {reaction : payload.reaction}}};
						schema[`${key}.${payload.rIndex}.from`] = {$all:[payload._id]};
						data = (await (this.db.collection(mongodbData['chats-collection']).updateOne(schema, updateSchema)));
						// console.log("Line 192",data);
					}

					else {
						delete schema[`${key}.${payload.rIndex}.from`];
						updateSchema = {$push : {[`${key}.$.from`] : payload._id}};
						data = (await (this.db.collection(mongodbData['chats-collection']).updateOne(schema, updateSchema)));
						// console.log("Line 200",data);
					}
				}

				else { //New Reaction
					delete schema[`${key}.reaction`];
					data = (await (this.db.collection(mongodbData['chats-collection']).updateOne(schema, {$push : {[key] : {from:[payload._id], reaction:payload.reaction}}})));
					// console.log("Line 205",data);
				}
			}
			RESOLVE(data);
		});
	}

	setICode(_orgId, ICode) {
		return this.db.collection(mongodbData['users-collection']).updateOne({_id : new ObjectId(_orgId)},{$set : {icode : ICode}});
	}

	getICode(_orgId) {
		return this.db.collection(mongodbData['users-collection']).aggregate([{$match : {_id:new ObjectId(_orgId)}},{$project :{_id:0, icode:1}}]).toArray();
	}

	getAllUsers(_orgId, payload) {
		return this.db.collection(mongodbData['users-collection']).aggregate(
		  [
			 {$match : {_org:_orgId, deleted : false}}
			,{$replaceWith : {$unsetField : {field:'password', input : '$$CURRENT'}}}
			,{$replaceWith : {$unsetField : {field:'type', input : '$$CURRENT'}}}
			,{$replaceWith : {$unsetField : {field:'_org', input : '$$CURRENT'}}}
			,{$group : {_id : null, page:{$first:payload.page}, limit:{$first:payload.limit}, xyz : {$push : '$$CURRENT'}}}
			,{$replaceWith : {$unsetField : {field:'_id', input : '$$CURRENT'}}}
			,{$replaceWith : {$setField : {field : 'users', input : '$$CURRENT', value : {$slice : ['$xyz',{$multiply:[payload.limit,{$subtract : [payload.page,1]}]},payload.limit]}}}}
			,{$replaceWith : {$setField : {field:'total', input : '$$CURRENT', value : {$divide:[{$size:'$xyz'},payload.limit]}}}}
			,{$replaceWith : {$unsetField : {field:'xyz', input : '$$CURRENT'}}}
			,{$replaceWith : {$setField : {field:'total', input : '$$CURRENT', value : {$cond:[{$eq:[{$floor:'$total'},'$total']},'$total', {$ceil : '$total'}]}}}}
		  ]).toArray();
	}

	deleteICode(_orgId) {
		return this.db.collection(mongodbData['users-collection']).updateOne({_id : new ObjectId(_orgId)},{$unset : {icode : true}});
	}

	setNewChat(payload) {
		return new Promise((resolve,reject) =>
		{
			this.db.collection(mongodbData['chats-collection']).insertOne({...payload, createdAt : new Date(), messages : []}).then(
			res =>
			{
				resolve({_id : res.insertedId.toString()});
			},
			rej =>
			{
				reject({databaseError : rej});
			});
		});
	}

	getChats(payload) {
		return this.db.collection(mongodbData['chats-collection']).aggregate([{$match : {type:payload.type, users : {$all : [...payload.users]}}}, {$project:{_id:1}}]).toArray();
	}

	updateUser(userId, payload) {
		return this.db.collection(mongodbData['users-collection']).updateOne({_id : new ObjectId(userId)}, {$set : payload});
	}

	createGroup(payload) {
		return this.db.collection(mongodbData['chats-collection']).insertOne(payload);
	}

	updateGroup(groupId, payload) {
		return this.db.collection(mongodbData['chats-collection']).updateOne({_id : new ObjectId(groupId)},
			{
				$set : payload
			});
	}

	modifyAdminInChats(chatId, payload) {
		return this.db.collection(mongodbData['chats-collection']).updateOne({_id:new ObjectId(chatId), 'users._id':payload._id},{
			$set : {
				'users.$.isAdmin' : payload.operationValue
			}
		});
	}

	addGroupUsers(chatId, payload) {
		return new Promise(async(resolve, reject) =>
		{
			let data = [await (this.db.collection(mongodbData['chats-collection']).updateOne({_id : new ObjectId(chatId)},
								 {
									 $addToSet : { 'users' : {$each : [...payload.users]}}
								 }))];

			if(payload.addedAgain.length != 0) {
				data.push(await (this.removeGroupUsers(chatId, {users : payload.addedAgain, operationValue : false})));
			}

			resolve(data);
		});
	}

	removeGroupUsers(chatId, payload) {
		return this.db.collection(mongodbData['chats-collection']).updateOne({_id:new ObjectId(chatId)},{
			$set : {
				'users.$[x].isRemoved' : payload.operationValue
			}
		}, { 'arrayFilters' : [{'x._id' : {$in : payload.users}}], multi : true});
	}
}

module.exports = {
	DatabaseService
};