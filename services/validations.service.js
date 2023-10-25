function isNameValid(str) {
	if(!str)
		return false ;
	let validString = "abcdefghijklmnopqrstuvwxyz" ;

	let index1 = 0, index2 ;
	while(index1 < str.length)
	{
		index2 = 0 ;
		while(index2 < validString.length)
		{
			if(str.charAt(index1) == validString.charAt(index2) || 
			   (str.charAt(index1)+"") == (validString.charAt(index2)+"").toUpperCase())
				break ;
			index2 ++ ;
		}

		if(index2 == validString.length)
			return false ;

		index1++ ;
	}

	return true ;
}

function isEmpty(object) {
	let error = {} ;
	let objKeys = Object.keys(object);
	for(let index of objKeys)
	{
		error.hasError = object[index] ? false : true ;
		error.error = {...error.error};
		error.error[index] = {
			value : object[index] ? object[index] : null,
			message : object[index] ? null : "Mandatory field"
		}
	}

	return error ;
}

module.exports = {
	isNameValid, isEmpty
}