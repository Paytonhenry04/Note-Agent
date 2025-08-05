import { LightningElement } from 'lwc';

export default class faqPage extends LightningElement {
    renderedCallback() {
        // Only run once
        if (this._anchorsEnhanced) return;
        this._anchorsEnhanced = true;

        const anchors = this.template.querySelectorAll('a[href^="#"]');
        anchors.forEach(anchor => {
            anchor.addEventListener('click', event => {
                const targetId = anchor.getAttribute('href').slice(1);
                const target = this.template.querySelector(`#${targetId}`);
                if (target) {
                    event.preventDefault();
                    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    history.replaceState(null, '', `#${targetId}`);
                }
            });
        });
    }
}