/*******************************************************************************
 * Copyright (c) 2014, Institute for Pervasive Computing, ETH Zurich.
 * All rights reserved.
 * 
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 * 1. Redistributions of source code must retain the above copyright
 *    notice, this list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright
 *    notice, this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 * 3. Neither the name of the Institute nor the names of its contributors
 *    may be used to endorse or promote products derived from this software
 *    without specific prior written permission.
 * 
 * THIS SOFTWARE IS PROVIDED BY THE INSTITUTE AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
 * ARE DISCLAIMED.  IN NO EVENT SHALL THE INSTITUTE OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS
 * OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)
 * HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT
 * LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY
 * OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF
 * SUCH DAMAGE.
 * 
 * This file is part of the Copper (Cu) CoAP user-agent.
 ******************************************************************************/
/**
 * \file
 *         Code handling Observing Resources
 *
 * \author  Matthias Kovatsch <kovatsch@inf.ethz.ch>\author
 */

Copper.ObserveEntry = function(uri, cb, token) {
	this.uri = uri;
	this.callback = cb;
	if (token!=null) {
		this.token = token;
	}
	
	return this;
};
Copper.ObserveEntry.prototype = {
	uri : null,
	callback: null,
	token : null,
	lastMID: -1
};

Copper.Observing = function() {
	// maybe support multiple subscriptions via sidebar in the future
	//this.subscriptions = new Object();
	
	return this;
};

Copper.Observing.prototype = {
	
	pending : null,
	subscription : null,
	
	subscribe : function(uri, cb) {
		// check for existing subscriptions
		if (this.subscription) {
			this.unsubscribe();
			return;
		}
		
		Copper.logEvent('INFO: Subscribing to ' + uri);
		
		var subscribe = new Copper.CoapMessage(Copper.getRequestType(), Copper.GET, uri);

		// add all debug options
		Copper.checkDebugOptions(subscribe);
		
		// set token depending on the behavior config
		if (Copper.behavior.observeToken && subscribe.getToken()) {
			subscribe.setToken( new Array(parseInt(Math.random()*0x100), parseInt(Math.random()*0x100)) );
			// update debug options
			if (document.getElementById('chk_debug_options').checked) {
				document.getElementById('debug_option_token').value = subscribe.getToken();
			}
		}
		
		if (Copper.behavior.blockSize!=0) {
			subscribe.setBlock2(0, Copper.behavior.blockSize);
		}
		
		this.pending = new Copper.ObserveEntry(uri, cb, subscribe.getToken());

		var that = this;
		Copper.endpoint.registerToken(subscribe.getToken(), Copper.myBind(that, that.handle));
		
		try {
			
			subscribe.setObserve(0);

			var that = this;
			Copper.clearLabels();
			Copper.endpoint.send(subscribe, Copper.myBind(that, that.handle));
		} catch (ex) {
			Copper.logError(ex);
		}
	},

	unsubscribe : function(token) {
		if (this.subscription) {
			Copper.logEvent('INFO: Unsubscribing ' + this.subscription.uri + '\n');
			Copper.endpoint.deRegisterToken(this.subscription.token);
			
			try {
				if (Copper.behavior.observeCancellation=='rst' && this.subscription.lastMID!=-1) {
					// Send a RST (with new message ID)
					var rst = new Copper.CoapMessage(Copper.MSG_TYPE_RST);
					rst.setMID(this.subscription.lastMID);
					Copper.endpoint.send( rst );
				} else if (Copper.behavior.observeCancellation=='cancel') {
					Copper.downloadMethod = Copper.GET;
					
					let uri = Copper.checkUri(); // get current URI
					var cancel = new Copper.CoapMessage(Copper.MSG_TYPE_CON, Copper.GET, uri); // always use CON
					cancel.setToken(this.subscription.token);
					
					cancel.setObserve(1);
					
					Copper.clearLabels();
					Copper.endpoint.send( cancel );
				}
			} catch (ex) {
				Copper.logError(ex);
			}
			
			Copper.updateLabel('info_code', 'Copper: Canceled', false); // call after displayMessageInfo()
			
			this.subscription = null;
		}
		
		document.getElementById('toolbar_observe').image = 'chrome://copper/skin/tool_observe.png';
		document.getElementById('toolbar_observe').label = 'Observe';
	},
	
	handle : function(message) {

		if (this.pending) {
			
			// check if server supports observing this resource
			if (message.isOption(Copper.OPTION_OBSERVE)) {
				
				this.subscription = new Copper.ObserveEntry(this.pending.uri, this.pending.callback, message.getToken());
				this.pending = null;
				
				document.getElementById('toolbar_observe').image = 'chrome://copper/skin/tool_unobserve.png';
				document.getElementById('toolbar_observe').label = 'Cancel ';

				this.subscription.lastMID = message.getMID();
				this.subscription.callback(message);
				
			} else {
				
				Copper.endpoint.deRegisterToken(this.pending.token);
				this.pending = null;
				
				message.getCopperCode = function() { return 'Resource not observable'; };
				
				Copper.defaultHandler(message);
			}
		} else if (this.subscription!=null) {
			this.subscription.lastMID = message.getMID();
			this.subscription.callback(message);
		} else {
			// somehow it must have gotten here
			Copper.endpoint.deRegisterToken(message.getToken());
			
			throw 'Missing context for Observing.handle()';
		}
	}
};