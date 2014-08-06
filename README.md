badge
=====

[![Build Status](https://travis-ci.org/jagoda/badge.svg?branch=master)](https://travis-ci.org/jagoda/badge)

> Stateless GitHub auth for [Hapi][hapi].

## Overview

This plugin provides two authentication schemes for [Hapi][hapi]: `github-basic`
and `github-token`. The basic scheme accepts GitHub usernames and passwords
as HTTP Basic Auth credentials. The token scheme accepts GitHub application
tokens via headers of the form `Authorization: token <token>`. The basic scheme
is also capable of generating access tokens if configured with a client ID and
secret. Similarly, the token scheme is capable of verifying that a token owner
belongs to a specified organization.

## Basic Auth

### Pass Through Mode

By default, the basic auth scheme will pass the `Authentication` header through
to GitHub and add the authenticated `username` to the `credentials` object if
accepted.

	server.auth.strategy("basic", "github-basic");

### Token Generation

If the basic scheme is configured with a client ID and secret, then a valid
login attempt will generate a new token that is added to the `artifacts` object
returned by [Hapi][hapi].

	server.auth.strategy("generate-token", "github-basic", {
		application : {
			clientId     : <client ID>,
			clientSecret : <client secret>,
			note         : <a description>,
			scopes       : <desired scopes>,
			url          : <a note URL>
		}
	});

### Organization Membership

If the basic scheme is configured with an organization name, then authenticated
users will be required to be a member of the specified organization. When
generating tokens, the token will only be requested if the user has been
authenticated and also belongs to the specified organization.

	server.auth.strategy("basic-org", "github-basic", {
		organization : <org name>
	});

## Token Auth

### Simple Validation

By default, the token scheme will simply verify that the supplied token is
valid.

	server.auth.strategy("token", "github-token", {
		clientId     : <client ID>,
		clientSecret : <client secret>
	});

### Organization Membership

If the token scheme is configured with an organization name, then any valid
tokens will also be required to be authorized with the specified organization.

	server.auth.strategy("token-org", "github-token", {
		clientId     : <client ID>,
		clientSecret : <client secret>,
		organization : <org name>
	});

## Realms

Both authentication methods are capable of including a realm with the
authentication challenge. To include a realm, simply supply a realm as part of
the strategy configuration:

	server.auth.strategy("realm", "github-basic", {
		realm : <realm>
	});

[Hapi]: https://github.com/spumko/hapi "Hapi"
