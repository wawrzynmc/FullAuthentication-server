// -- libraries
const { validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');

// -- my own imports
const HttpError = require('../helpers/http-error');
const { decrypt, encrypt } = require('../helpers/encrypt-data');
const { accountActivation } = require('../helpers/mailers/appMailer');

// -- models
const User = require('../models/user-model');

// -- config .env to ./config/config.env
require('dotenv').config({
	path: './config/config.env',
});

// * -- CONTROLLERS
const signupController = async (req, res, next) => {
	// * ---- body validation
	const errors = validationResult(req);
	if (!errors.isEmpty()) {
		const firstErrorMsg = errors.array({ onlyFirstError: true })[0].msg;
		const optionalMsg = 'Invalid inputs passed. Please, check your data.';
		return next(new HttpError(firstErrorMsg || optionalMsg, 422));
	}

	const signupServerErrorMsg = `Signing up failed - something went wrong during processing the request.`;
	let { name, email, password1: password } = req.body;
	let user, successMsg;

	// * ---- check if user already exists
	try {
		// add isActive = true
		existingUser = await User.findOne({ email: email });
	} catch (err) {
		return next(new HttpError(signupServerErrorMsg, 500));
	}

	if (existingUser) {
		let userIsActive = existingUser.isActive;

		if (userIsActive) {
			return next(
				new HttpError(`User with that email already exists.`, 409)
			);
		} else {
			user = existingUser;
			name = user.name;
			successMsg = `Dear ${name}, seems like you have already create account, but it is deactivated. We send you an activation email.`;
		}
	} else {
		// * ---- create user
		successMsg = `Signup succeeded. Activation email has been sent to ${email}.`;
		user = new User({
			name,
			email,
			password,
		});
		try {
			await user.save();
		} catch (err) {
			return next(
				new HttpError(
					`Signup failed - something went wrong during processing the request.`,
					500
				)
			);
		}
	}

	// * ---- generate token to activate account
	let token;
	try {
		token = jwt.sign(
			{
				userId: user.id,
				name,
				email,
			},
			process.env.JWT_SECRET_ACCOUNT_ACTIVATION,
			{ expiresIn: '15m' }
		);
	} catch (err) {
		return new HttpError(signupServerErrorMsg, 500);
	}

	// * ---- send activation email
	try {
		await accountActivation({
			to: email,
			name: name || 'unknown user',
			activationHref: `${process.env.CLIENT_URL}/account/activate/${token}`,
			resetPasswordHref: `${process.env.CLIENT_URL}/account/forgot-password`,
		});
	} catch (err) {
		return next(new HttpError(signupServerErrorMsg, 500));
	}

	res.status(201).json({
		success: true,
		message: successMsg,
	});
};

const activateController = async (req, res, next) => {
	let decodedToken;
	const activationServerErrorMsg = `Activation failed - something went wrong during processing the request.`;

	try {
		const token = req.headers.authorization.split(' ')[1];
		decodedToken = jwt.verify(
			token,
			process.env.JWT_SECRET_ACCOUNT_ACTIVATION
		);
	} catch (err) {
		return next(
			new HttpError(
				'Authentication failed. Please, try to activate your account once more.',
				403
			)
		);
	}

	const { userId, email } = decodedToken;

	// * ---- find user
	// -- check if user is already active
	try {
		user = await User.findOne({ email: email });
	} catch (err) {
		return next(new HttpError(activationServerErrorMsg, 500));
	}

	// * ---- activate account
	if (user) {
		try {
			user.isActive = false;
			await user.save();
		} catch (err) {
			return next(new HttpError(activationServerErrorMsg, 500));
		}
	} else {
		return next(new HttpError(`User with that email doesn't exists`, 404));
	}

	res.status(204).json({
		success: true,
		message: `Account user with email: ${email} has been activated`,
	});
};

const signinController = async (req, res, next) => {
	// * ---- body validation
	const errors = validationResult(req);
	if (!errors.isEmpty()) {
		const firstErrorMsg = errors.array().map((error) => error.msg)[0];
		return next(
			new HttpError(
				firstErrorMsg ||
					`Invalid inputs passed, please check your data.`,
				422
			)
		);
	}

	const signinServerErrorMsg = `Signin failed - something went wrong during processing the request.`;
	const invalidCredentialsErrorMsg =
		'Invalid credentials - could not log in.';
	const { email, password } = req.body;
	let user;

	// * ---- get user
	try {
		user = await User.findOne({ email: email });
	} catch (err) {
		return next(new HttpError(signinServerErrorMsg, 500));
	}

	// ! check if user is active

	// * ---- check if user exists
	if (!user) {
		return next(new HttpError(invalidCredentialsErrorMsg, 403));
	}

	// * ---- authenticate user
	let authenticatedUser;
	try {
		authenticatedUser = await user.authenticate(password);
	} catch (err) {
		return next(new HttpError(signinServerErrorMsg, 500));
	}

	if (!authenticatedUser) {
		return next(new HttpError(invalidCredentialsErrorMsg, 403));
	}

	// * ---- generate token
	const token = jwt.sign(
		{
			_id: user._id,
		},
		process.env.JWT_SECRET,
		{ expiresIn: '1d' }
	);

	res.json({
		success: true,
		message: 'Signin succeeded',
		user: {
			_id,
			name,
			email,
			role,
		},
		token,
	});
};
const signinGoogleController = async (req, res, next) => {};
const signinFacebookController = async (req, res, next) => {};

const forgotPasswordController = async (req, res, next) => {};
const resetPasswordController = async (req, res, next) => {};

exports.signupController = signupController;
exports.signinController = signinController;
exports.signinGoogleController = signinGoogleController;
exports.signinFacebookController = signinFacebookController;
exports.activateController = activateController;
exports.forgotPasswordController = forgotPasswordController;
exports.resetPasswordController = resetPasswordController;
