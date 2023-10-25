const { DatabaseService } = require("./database.service.js");
const { isNameValid, isEmpty } = require("./validations.service.js");
const { ExtraService } = require("./extra.service.js");
const { TokenService } = require("./token.service.js");
const bcrypt = require('bcrypt');

var databaseService, extraService, tokenService ;

class ExpressService
{
	constructor(server) {
		databaseService = new DatabaseService(server);
		extraService = new ExtraService();
		tokenService = new TokenService();
	}

	login(req,res) {
		let error = {} ;
		if(req.body["email"]) {
			databaseService.fetchUser(req.body["email"]).then((resolve,reject) => {
				if(resolve.length > 0) {
					if(req.body["password"]) {
						bcrypt.compare(req.body["password"], resolve[0].password, (err, result) => {
						    if(result) {
						    	tokenService.getNewToken({email: req.body["email"], password : resolve[0].password}).then(async(token) => {
									error = {
										meow:'meow',
										user : (await (databaseService.selfCall({deleted:false, ...req.body, password : resolve[0].password})))[0],
										token : token
									};
									res.send(error);
						    	});
							}

							else {
								error = {
									hasError : true,
									error : {
									  "password" : {
									    value : req.body["password"],
									    message : "Wrong Password"
									  }
									}
								};
							    res.status(500).send(error);
							}
						});
					}

					else {
						error = {
							hasError : true,
							error : {
							  "password" : {
							    value : null,
							    message : "Mandatory field"
							  }
							}
						};
						res.status(500).send(error);
					}
				}

				else {
					error.hasError = true ;
					error.error = { ...error.error,
				                    "email" : {
				                   	 value : req.body.email,
				                   	 message : "Email doesn\'t exist"
				                   }
					              };
					res.status(500).send(error);
				}
			});
		}

		else {
			if(!req.body["password"]) {
				error = {
					hasError : true,
					error : {
					  "password" : {
					    value : null,
					    message : "Mandatory field"
					  }
					}
				};
			}

			if(!error.hasError)
				error.hasError = true ;
			error.error = {
				...error.error,
				"email" : {
				  value : null,
				  message : "Mandatory field"
				}
			}
			res.status(500).send(error);
		}
	};

	register(req,res) {
		let error = {};
		if(!req.body['first-name'] && req.body['type'] == "_emp") {
			error.hasError = true ;
			error.error = {
				"first-name" : {
				  value : null,
				  message : "Mandatory field"
				}
			}
		}

		else if(req.body['first-name'] && !isNameValid(req.body['first-name']) && req.body['type'] == "_emp") {
			error.hasError = true ;
			error.error = {
				"first-name" : {
				  value : req.body['first-name'],
				  message : "Invalid name"
				}
			}
		}

		if(!req.body['last-name'] && req.body['type'] == "_emp") {
			error.hasError = true ;
			error.error = {
				...error.error,
				"last-name" : {
				  value : null,
				  message : "Mandatory field"
				}
			}
		}

		else if(req.body['last-name'] && !isNameValid(req.body['last-name']) && req.body['type'] == "_emp") {
			error.hasError = true ;
			error.error = {
				...error.error,
				"last-name" : {
				  value : req.body['last-name'],
				  message : "Invalid name"
				}
			}
		}

		if(!req.body['icode'] && (req.body['type'] == "_emp" && !req.body['_id'])) {
			error.hasError = true ;
			error.error = {
				...error.error,
				"icode" : {
				  value : null,
				  message : "Mandatory field"
				}
			}
		}

		if(!req.body['c-name'] && req.body['type'] == "_org") {
			error.hasError = true ;
			error.error = {
				...error.error,
				"c-name" : {
				  value : null,
				  message : "Mandatory field"
				}
			}
		}		

		if(!req.body['confirm-password']) {
			error.hasError = true ;
			error.error = {
				...error.error,
				"confirm-password" : {
				  value : null,
				  message : "Mandatory field"
				}
			}
		}

		else if(req.body['confirm-password'] && req.body['confirm-password'].length>8) {
			error.hasError = true ;
			error.error = {
				...error.error,
				"confirm-password" : {
				  value : req.body['confirm-password'],
				  message : "Max size 8"
				}
			}
		}

		if(req.body['email']) {
			databaseService.fetchSingleUser(req.body['email']).then((resolve,reject) => {
				if(resolve && resolve.email) {
					error.hasError = true ;
					error.error = {
						...error.error,
						"email" : {
						  value : req.body['email'],
						  message : "Email already exists"
						}
					}
					res.status(500).send(error);
				}
				else if(!error.hasError) {
					bcrypt.hash(req.body['confirm-password'], 10, async(err, hash) => {
						let payload = {
							email : req.body['email'],
							password : hash,
							createdAt : new Date(),
							deleted : false,
							type : req.body['type']
						};
						if(payload.type == '_emp') {
							payload['role'] = "non-admin";
							payload['name'] = req.body['first-name']+" "+req.body['last-name'];
						}

						else if(payload.type == '_org')
							payload['c-name'] = req.body['c-name']

						if(req.body['_id'])
							payload['_org'] = req.body['_id'];

						if(req.body['icode']) {
							tokenService.getPayload(req.body['icode']).then(
							async(resolve) =>
							{
								if((await databaseService.getICode(resolve._id))[0].icode == req.body['icode']) {
									payload['_org'] = resolve._id;
									databaseService.deleteICode(resolve._id);
									databaseService.setNewUser(payload);
								}
								else {
									error.hasError = true ;
									error.error = {
										...error.error,
										"icode" : {
										  value : req.body['icode'],
										  message : "Wrong Code"
										}
									}
									res.status(500).send(error);
									res.end();
								}
							},
							Err =>
							{
								res.status(500).send(Err);
								res.end();
							});
						}

						else  {						
							databaseService.setNewUser(payload).then(
							RES =>
							{
								if(req.body['_id']) {
									delete payload.type ; delete payload.password ; delete payload._org ;
									payload = { data : { ...payload, _id:RES.insertedId.toString()}};
								}
								res.send({ isRegistered:true, ...payload });
								res.end();
							},
							REJ =>
							{
								res.status(500).send({"databaseError" : REJ});
								res.end();
							});
						}
					});
				}
				else
					res.status(500).send(error);
			});
		}

		else {
			error.hasError = true ;
			error.error = {
				...error.error,
				"email" : {
				  value : null,
				  message : "Mandatory field"
				}
			}
			res.status(500).send(error);
		}
	};

	delete(req,res) {
		databaseService.removeUser(req.params.id).then(
		RESOLVE =>
		{
			res.send(RESOLVE);
			res.end();
		},
		REJECT =>
		{
			res.status(500).send(REJECT);
			res.end();
		});
	}

	self(req,res) {
		tokenService.getPayload(req.headers.authorization).then(
		RESOLVE => {
		  delete RESOLVE.iat ;
		  databaseService.selfCall(RESOLVE).then(
		  	RES =>
			{
			  if(RES[0].email == RESOLVE.email)
			  	res.send(RES[0]);
			  else
			  	res.status(500).send("User not found");
			},
			REJ =>
			{
				res.status(500).send({databaseError : REJ});
			});
		},
		REJECT => {
			res.status(500).send({tokenError : REJECT});
		});
	};

	checkAuthorization(req,res,next) {
		tokenService.getPayload(req.headers.authorization).then(
		RESOLVE =>
		{
			delete RESOLVE.iat ;
			databaseService.selfCall({deleted : false, ...RESOLVE}).then(
			RES =>
			{
			  if(RES[0].email == RESOLVE.email) {
			  	req.body['_id'] = RES[0]._id;
			  	next();
			  }
			  else {
			  	res.status(500).send("User Not Found");
			  	res.end();
			  }
			},
			REJ =>
			{
				res.status(500).send({databaseError : REJECT});
			  	res.end();
			});
		},
		REJECT =>
		{
			res.status(500).send({tokenError : REJECT});
			res.end();
		});
	}

	groups(req,res) {
	  databaseService.fetchGroups(req.body._id.toString()).then(
  	  RESOLVE =>
  	  {
	    res.send(RESOLVE);
	    res.end();
	  },
	  REJECT => 
	  {
	    res.status(500).send(REJECT);
  	    res.end();	
	  });
	};

	group(req,res) {
	  databaseService.fetchGroup(req.body._id.toString(), req.params["id"], req.query.messageSection || 0).then(
  	  RESOLVE =>
  	  {
	    res.send(RESOLVE);
	    res.end();
	  },
	  REJECT => 
	  {
	    res.status(500).send(REJECT);
  	    res.end();	
	  });
	};

	addNewMessage(req,res) {
		if(req.query.attachment) {
			let payload ;
			extraService.toEncrypt(req.files.attachment[0].path).then(resolve => {
				payload = { ...req.body,
				            isDeleted : false,
				            attachments : [{...resolve,
				            	            type : req.files.attachment[0].mimetype,
				            	            name : req.files.attachment[0].originalname
				                           }]
			              };
			    databaseService.addNewMessage(req.params.id, payload).then(resolve => {
					res.send(resolve);
					res.end();
				});
			});
		}
		else {
			databaseService.addNewMessage(req.params.id, {...req.body, isDeleted : false}).then(resolve => {
				res.send(resolve);
				res.end();
			});
		}
	};

	deleteMessage(req, res) {
		databaseService.deleteMessage(req.params.id,req.body.index).then(
		resolve =>
		{
			res.send(resolve);
			res.end();
		},
		reject =>
		{
			res.status(500).send(reject);
			res.end();
		});
	}

	reaction(req,res) {
		databaseService.react(req.params.id,{...req.body}).then(
		resolve =>
		{
			res.send(resolve);
			res.end();
		},
		reject =>
		{
			res.status(500).send(reject);
			res.end();
		});
	}

	setInviteCode(req,res) {
	  tokenService.getNewToken({_id:req.params.id}).then(
  	  token =>
  	  {
		  databaseService.setICode(req.params.id, token).then(
		  async(RESOLVE) =>
	  	  {
	  		res.send((await databaseService.getICode(req.params.id))[0]);
	  	    res.end();
	  	  },
	  	  REJECT =>
	  	  {
	  		res.status(500).send(REJECT);
	  		res.end();
	  	  });
	  },
	  error =>
	  {
	    res.status(500).send(error);
	    res.end();
	  });
	}

	getAllUsers(req,res) {
		databaseService.getAllUsers(req.params.id, {
			page : parseInt(req.query.page) || 1,
			limit : parseInt(req.query.limit) || 5
		}).then(
		resolve =>
		{
			if(resolve.length != 0)
				res.send(resolve[0]);
			else
				res.status(500).send("Database Error");
			res.end();
		},
		reject =>
		{
			res.status(500).send(reject);
			res.end();
		});
	}

	getChats(req,res) {
		databaseService.getChats({...req.body}).then(
		RESOLVE =>
		{
			if(RESOLVE.length != 0){
				res.send(RESOLVE[0]);
				res.end();
			}

			else {
				databaseService.setNewChat({...req.body}).then(
				RES =>
				{
					res.send(RES);
					res.end();
				},
				REJ =>
				{
					res.status(500).send(REJ);
					res.end();
				});
			}
		},
		REJECT =>
		{
			res.status(500).send(REJECT);
		});
	}

	updateUser(req,res) {
		databaseService.updateUser(req.params.id, {...req.body}).then(
		RESOLVE =>
		{
			res.send(RESOLVE);
			res.end();
		},
		REJECT =>
		{
			res.status(500).send(REJECT);
			res.end();
		});
	}

	createGroup(req,res) {
		databaseService.createGroup({type:'group', createdAt:new Date(), messages:[], ...req.body}).then(
		RESOLVE =>
		{
			res.send(RESOLVE);
			res.end();
		},
		REJECT =>
		{
			res.status(500).send(REJECT);
			res.end();
		});
	}

	modifyAdmin(req, res) {
		databaseService.modifyAdminInChats(req.params.id, req.body).then(
		RESOLVE =>
		{
			res.send(RESOLVE.modifiedCount == 1);
			res.end();
		},
		REJECT =>
		{
			res.status(500).send({"databaseError" : REJECT});
			res.end();
		});
	}

	updateProfile(req,res) {
		databaseService.updateGroup(req.params.id, req.body).then(
		RESOLVE =>
		{
			res.send(RESOLVE.modifiedCount == 1);
			res.end();
		},
		REJECT =>
		{
			res.status(500).send({"databaseError" : REJECT});
			res.end();
		});
	}

	addUsersToGroup(req,res) {
		databaseService.addGroupUsers(req.params.id, req.body).then(
		RESOLVE =>
		{
			res.send(RESOLVE[0].modifiedCount == 1 || (RESOLVE.length == 2 && RESOLVE[1].modifiedCount == 1));
			res.end();
		},
		REJECT =>
		{
			res.status(500).send({"databaseError" : REJECT});
			res.end();
		});
	}

	removeUsersFromGroup(req,res) {
		databaseService.removeGroupUsers(req.params.id, {...req.body, operationValue : true}).then(
		RESOLVE =>
		{
			res.send(RESOLVE.modifiedCount == 1);
			res.end();
		},
		REJECT =>
		{
			res.status(500).send({"databaseError" : REJECT});
			res.end();
		});
	}
}

module.exports = {
	ExpressService
}