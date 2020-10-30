import {
    Component,
    OnInit,
} from '@angular/core';

import {
    ActivatedRoute,
    Router,
} from '@angular/router';

import { ApiService } from 'jslib/abstractions/api.service';
import { CryptoService } from 'jslib/abstractions/crypto.service';
import { CryptoFunctionService } from 'jslib/abstractions/cryptoFunction.service';
import { I18nService } from 'jslib/abstractions/i18n.service';
import { PlatformUtilsService } from 'jslib/abstractions/platformUtils.service';

import { Utils } from 'jslib/misc/utils';

import { SymmetricCryptoKey } from 'jslib/models/domain/symmetricCryptoKey';
import { SendAccess } from 'jslib/models/domain/sendAccess';

import { SendAccessView } from 'jslib/models/view/sendAccessView';

import { SendType } from 'jslib/enums/sendType';
import { SendAccessRequest } from 'jslib/models/request/sendAccessRequest';
import { ErrorResponse } from 'jslib/models/response/errorResponse';

import { SendAccessResponse } from 'jslib/models/response/sendAccessResponse';

@Component({
    selector: 'app-send-access',
    templateUrl: 'access.component.html',
})
export class AccessComponent implements OnInit {
    send: SendAccessView;
    sendType = SendType;
    downloading = false;
    loading = true;
    passwordRequired = false;
    formPromise: Promise<SendAccessResponse>;
    password: string;
    showText = false;

    private id: string;
    private key: string;
    private decKey: SymmetricCryptoKey;

    constructor(router: Router, private i18nService: I18nService,
        private apiService: ApiService, private platformUtilsService: PlatformUtilsService,
        private route: ActivatedRoute, private cryptoService: CryptoService,
        private cryptoFunctionService: CryptoFunctionService) {
        // TODO
    }

    get sendText() {
        if (this.send == null || this.send.text == null) {
            return null;
        }
        return this.showText ? this.send.text.text : this.send.text.maskedText;
    }

    ngOnInit() {
        this.route.params.subscribe((params) => {
            this.id = params.sendId;
            const queryParamsSub = this.route.queryParams.subscribe(async (qParams) => {
                if (qParams.key != null) {
                    this.key = qParams.key;
                }
                if (queryParamsSub != null) {
                    queryParamsSub.unsubscribe();
                }

                if (this.key == null || this.id == null) {
                    return;
                }

                await this.load();
            });
        });
    }

    async download() {
        if (this.send == null || this.decKey == null) {
            return;
        }

        if (this.downloading) {
            return;
        }

        this.downloading = true;
        const response = await fetch(new Request(this.send.file.url, { cache: 'no-store' }));
        if (response.status !== 200) {
            this.platformUtilsService.showToast('error', null, this.i18nService.t('errorOccurred'));
            this.downloading = false;
            return;
        }

        try {
            const buf = await response.arrayBuffer();
            const decBuf = await this.cryptoService.decryptFromBytes(buf, this.decKey);
            this.platformUtilsService.saveFile(window, decBuf, null, this.send.file.fileName);
        } catch (e) {
            this.platformUtilsService.showToast('error', null, this.i18nService.t('errorOccurred'));
        }

        this.downloading = false;
    }

    selectText() {
        (document.getElementById('text') as HTMLInputElement).select();
    }

    copyText() {
        this.platformUtilsService.copyToClipboard(this.send.text.text);
        this.platformUtilsService.showToast('success', null, 'Copied!');
    }

    toggleText() {
        this.showText = !this.showText;
    }

    private async load() {
        const keyArray = Utils.fromUrlB64ToArray(this.key);
        const accessRequest = new SendAccessRequest();
        if (this.password != null) {
            const passwordHash = await this.cryptoFunctionService.pbkdf2(this.password, keyArray, 'sha256', 100000);
            accessRequest.password = Utils.fromBufferToB64(passwordHash);
        }
        try {
            let sendResponse: SendAccessResponse = null;
            if (this.loading) {
                sendResponse = await this.apiService.postSendAccess(this.id, accessRequest);
            } else {
                this.formPromise = this.apiService.postSendAccess(this.id, accessRequest);
                sendResponse = await this.formPromise;
            }
            this.passwordRequired = false;
            const sendAccess = new SendAccess(sendResponse);
            this.decKey = new SymmetricCryptoKey(keyArray.buffer);
            this.send = await sendAccess.decrypt(this.decKey);
            this.showText = this.send.text != null ? !this.send.text.hidden : true;
        } catch (e) {
            if (e instanceof ErrorResponse) {
                if (e.statusCode === 401) {
                    this.passwordRequired = true;
                }
            }
        }
        this.loading = false;
    }
}
