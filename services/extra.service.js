var { createCanvas, loadImage } = require("canvas");

class ExtraService
{
	toEncrypt(path) {
		return new Promise((resolve, reject) =>{
			loadImage(path).then(image => {
			let context =  createCanvas(image.width,image.height).getContext('2d');
			context.drawImage(image,0,0);
		  	resolve({ w : image.width,
		  	          h : image.height,
		  	          data : new ExtraService().convert(context.getImageData(0,0,image.width,image.height).data)
		  	       });
		  });
		});
	}

	convert(data) {
		var str = "" ;
		var num = 0 ;
		let vl ;
		for(var d of data) {
			if(num != 3) {
				vl = new ExtraService().toHex(d);
				str += (vl.length == 1 ? '0' : '') + vl;
				num ++ ;
			}
			else if(d != 255) {
				vl = new ExtraService().toHex(d);
				str += (vl.length == 1 ? '0' : '') + vl + '#';
				num = 0 ;
			}

			else {
				num = 0 ;
			}

		}

		return str ;
	}

	toHex(num) {
		var arr = ['0','1','2','3','4','5','6','7','8','9','A','B','C','D','E','F'];
		var hexCode = "" ;
		do {
		   hexCode = arr[Math.floor(num%16)] + hexCode ;
		   num = Math.floor(num/16) ;
		}
		while(num > 0);
		return hexCode ;
	}
}

module.exports = {
	ExtraService
}