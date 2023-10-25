class TokenService
{
	jwt ;

	constructor() {
		this.jwt = require("jsonwebtoken");
	}

	getNewToken(payload, privateKey = "123", options = {algorithm : "HS256"}) {
		return new Promise((resolve, reject) => {
			this.jwt.sign(payload, privateKey, options, (error, token) => {
				if(error)
					reject(error);
				else
					resolve(token);
			});
		});
	}

	getPayload(token, privateKey = "123") {
		return new Promise((resolve, reject) => {
			this.jwt.verify(token, privateKey, (error, payload) => {
				if(error)
					reject(error);
				else
					resolve(payload);
			});
		});
	}
}

module.exports = {
	TokenService
}