import type { Meta } from "@storybook/react";
import React from "react";

import { Container } from "../index_with_tw_base";

const meta = {
  title: "Layouts/Container",
} satisfies Meta;

export default meta;

export const AppContainer = () => {
  return (
    <div className="s-h-[700px] s-w-full">
      <Container className="s-h-full s-border s-border-pink-300" fixed>
        <div className="s-space-y-4 s-text-base s-leading-relaxed s-text-gray-800">
          <div>
            Lorem ipsum dolor sit amet, consectetur adipiscing elit. Vestibulum
            ultricies dictum sapien, sed imperdiet dui consequat et. Nullam
            feugiat, felis at auctor finibus, dolor ex blandit ante, sed finibus
            orci tellus nec ante. Maecenas rutrum tincidunt dui, in congue justo
            imperdiet vel. Donec in elit eros. Phasellus sed dignissim metus.
            Suspendisse suscipit tristique nisl, semper rhoncus nunc congue non.
            Vestibulum sed congue mauris. Suspendisse at mauris finibus, mattis
            nisl sed, egestas libero. Aliquam erat volutpat. Curabitur blandit
            finibus posuere. Nunc quis ante ante. Donec non lectus semper,
            ullamcorper ex ac, aliquam urna. Nulla et sem id mi dapibus
            convallis.
          </div>
          <div>
            Donec sit amet pretium magna, sed eleifend dui. Fusce semper nec
            lectus suscipit eleifend. Nulla facilisi. Etiam fermentum, sapien a
            rhoncus rhoncus, erat mauris suscipit dui, eget egestas eros ex vel
            purus. Cras quis diam ut purus fermentum tincidunt fermentum sit
            amet nisl. Etiam non efficitur diam, vulputate vulputate diam.
            Praesent in velit sem. In vehicula augue quis orci faucibus
            tristique. Praesent ut ultricies mi, eu lacinia augue. Sed malesuada
            justo enim, quis vulputate est imperdiet vitae. Praesent odio nunc,
            mollis vel blandit id, volutpat nec erat. Donec a congue nibh. Morbi
            ultrices, lacus eu interdum laoreet, odio tellus scelerisque elit,
            eget eleifend felis sem ac enim.
          </div>
          <div>
            Suspendisse imperdiet diam ac feugiat feugiat. Aliquam pulvinar
            vestibulum laoreet. Morbi sed sodales ex, non placerat ligula. Donec
            at viverra nisi. Vivamus neque massa, ultricies et enim sit amet,
            sodales lacinia massa. Sed rutrum risus a ipsum elementum venenatis.
            Praesent pharetra, nisi nec congue eleifend, nisi nibh interdum
            nibh, at sodales eros ex a lorem. Morbi et lectus non metus
            consectetur tincidunt nec a est. Aliquam aliquam lorem commodo sem
            congue consequat. Quisque mattis est id metus cursus luctus. Sed
            lobortis egestas lorem eget ultrices.
          </div>
          <div>
            Aliquam varius dapibus diam, at semper nibh tempus et. Quisque non
            egestas elit. Nulla tristique turpis id lorem placerat, eu laoreet
            ipsum pretium. Fusce ultrices pellentesque lorem, scelerisque cursus
            diam scelerisque a. Proin dictum et eros sit amet hendrerit.
            Curabitur scelerisque libero sit amet neque auctor, in pellentesque
            elit viverra. Vestibulum odio arcu, tempus quis felis vel, blandit
            accumsan odio. Fusce faucibus dignissim lacus, non dictum orci
            elementum in. Nulla maximus nisl vitae tortor tempor, sed iaculis
            quam interdum. Aliquam nibh diam, porta a sodales et, finibus id
            metus. Curabitur ornare viverra nulla, ac convallis nibh venenatis
            eu. Proin feugiat, urna non fermentum bibendum, dolor nibh
            pellentesque nisl, non condimentum nibh justo non massa. Proin
            placerat placerat libero eu molestie.
          </div>
          <div>
            Quisque quis quam tristique, vehicula magna vel, convallis eros. Nam
            elementum dictum tempus. Aenean luctus orci in diam ultricies
            fringilla. Vestibulum tempor orci quis feugiat vulputate. Sed
            aliquet, libero et efficitur vestibulum, leo quam tristique magna,
            sit amet rhoncus neque elit eu ex. Suspendisse lobortis lectus eu
            nibh commodo, eget imperdiet magna porta. Vestibulum non velit at
            urna ornare tristique. Nullam malesuada varius orci, id ultrices
            elit. Praesent molestie, arcu id tristique facilisis, nisi nulla
            mattis mi, nec laoreet sapien dui eu nisi. Fusce sit amet porttitor
            mauris. Etiam posuere, justo sit amet dapibus blandit, libero elit
            pharetra elit, et iaculis dui risus nec magna. Vestibulum a diam ex.
          </div>
        </div>
      </Container>
    </div>
  );
};

export const FixedExample = () => {
  return (
    <div className="s-h-[700px] s-w-full">
      <Container className="s-h-full s-border s-border-pink-300" fixed>
        <div className="s-space-y-4 s-text-base s-leading-relaxed s-text-gray-800">
          <div>
            Lorem ipsum dolor sit amet, consectetur adipiscing elit. Vestibulum
            ultricies dictum sapien, sed imperdiet dui consequat et. Nullam
            feugiat, felis at auctor finibus, dolor ex blandit ante, sed finibus
            orci tellus nec ante. Maecenas rutrum tincidunt dui, in congue justo
            imperdiet vel. Donec in elit eros. Phasellus sed dignissim metus.
            Suspendisse suscipit tristique nisl, semper rhoncus nunc congue non.
            Vestibulum sed congue mauris. Suspendisse at mauris finibus, mattis
            nisl sed, egestas libero. Aliquam erat volutpat. Curabitur blandit
            finibus posuere. Nunc quis ante ante. Donec non lectus semper,
            ullamcorper ex ac, aliquam urna. Nulla et sem id mi dapibus
            convallis.
          </div>
          <div>
            Donec sit amet pretium magna, sed eleifend dui. Fusce semper nec
            lectus suscipit eleifend. Nulla facilisi. Etiam fermentum, sapien a
            rhoncus rhoncus, erat mauris suscipit dui, eget egestas eros ex vel
            purus. Cras quis diam ut purus fermentum tincidunt fermentum sit
            amet nisl. Etiam non efficitur diam, vulputate vulputate diam.
            Praesent in velit sem. In vehicula augue quis orci faucibus
            tristique. Praesent ut ultricies mi, eu lacinia augue. Sed malesuada
            justo enim, quis vulputate est imperdiet vitae. Praesent odio nunc,
            mollis vel blandit id, volutpat nec erat. Donec a congue nibh. Morbi
            ultrices, lacus eu interdum laoreet, odio tellus scelerisque elit,
            eget eleifend felis sem ac enim.
          </div>
          <div>
            Suspendisse imperdiet diam ac feugiat feugiat. Aliquam pulvinar
            vestibulum laoreet. Morbi sed sodales ex, non placerat ligula. Donec
            at viverra nisi. Vivamus neque massa, ultricies et enim sit amet,
            sodales lacinia massa. Sed rutrum risus a ipsum elementum venenatis.
            Praesent pharetra, nisi nec congue eleifend, nisi nibh interdum
            nibh, at sodales eros ex a lorem. Morbi et lectus non metus
            consectetur tincidunt nec a est. Aliquam aliquam lorem commodo sem
            congue consequat. Quisque mattis est id metus cursus luctus. Sed
            lobortis egestas lorem eget ultrices.
          </div>
          <div>
            Aliquam varius dapibus diam, at semper nibh tempus et. Quisque non
            egestas elit. Nulla tristique turpis id lorem placerat, eu laoreet
            ipsum pretium. Fusce ultrices pellentesque lorem, scelerisque cursus
            diam scelerisque a. Proin dictum et eros sit amet hendrerit.
            Curabitur scelerisque libero sit amet neque auctor, in pellentesque
            elit viverra. Vestibulum odio arcu, tempus quis felis vel, blandit
            accumsan odio. Fusce faucibus dignissim lacus, non dictum orci
            elementum in. Nulla maximus nisl vitae tortor tempor, sed iaculis
            quam interdum. Aliquam nibh diam, porta a sodales et, finibus id
            metus. Curabitur ornare viverra nulla, ac convallis nibh venenatis
            eu. Proin feugiat, urna non fermentum bibendum, dolor nibh
            pellentesque nisl, non condimentum nibh justo non massa. Proin
            placerat placerat libero eu molestie.
          </div>
          <div>
            Quisque quis quam tristique, vehicula magna vel, convallis eros. Nam
            elementum dictum tempus. Aenean luctus orci in diam ultricies
            fringilla. Vestibulum tempor orci quis feugiat vulputate. Sed
            aliquet, libero et efficitur vestibulum, leo quam tristique magna,
            sit amet rhoncus neque elit eu ex. Suspendisse lobortis lectus eu
            nibh commodo, eget imperdiet magna porta. Vestibulum non velit at
            urna ornare tristique. Nullam malesuada varius orci, id ultrices
            elit. Praesent molestie, arcu id tristique facilisis, nisi nulla
            mattis mi, nec laoreet sapien dui eu nisi. Fusce sit amet porttitor
            mauris. Etiam posuere, justo sit amet dapibus blandit, libero elit
            pharetra elit, et iaculis dui risus nec magna. Vestibulum a diam ex.
          </div>
        </div>
      </Container>
    </div>
  );
};

export const FluidExample = () => {
  return (
    <div className="s-h-[700px] s-w-full">
      <Container className="s-h-full s-border s-border-pink-300">
        <div className="s-space-y-4 s-text-base s-leading-relaxed s-text-gray-800">
          <div>
            Lorem ipsum dolor sit amet, consectetur adipiscing elit. Vestibulum
            ultricies dictum sapien, sed imperdiet dui consequat et. Nullam
            feugiat, felis at auctor finibus, dolor ex blandit ante, sed finibus
            orci tellus nec ante. Maecenas rutrum tincidunt dui, in congue justo
            imperdiet vel. Donec in elit eros. Phasellus sed dignissim metus.
            Suspendisse suscipit tristique nisl, semper rhoncus nunc congue non.
            Vestibulum sed congue mauris. Suspendisse at mauris finibus, mattis
            nisl sed, egestas libero. Aliquam erat volutpat. Curabitur blandit
            finibus posuere. Nunc quis ante ante. Donec non lectus semper,
            ullamcorper ex ac, aliquam urna. Nulla et sem id mi dapibus
            convallis.
          </div>
          <div>
            Donec sit amet pretium magna, sed eleifend dui. Fusce semper nec
            lectus suscipit eleifend. Nulla facilisi. Etiam fermentum, sapien a
            rhoncus rhoncus, erat mauris suscipit dui, eget egestas eros ex vel
            purus. Cras quis diam ut purus fermentum tincidunt fermentum sit
            amet nisl. Etiam non efficitur diam, vulputate vulputate diam.
            Praesent in velit sem. In vehicula augue quis orci faucibus
            tristique. Praesent ut ultricies mi, eu lacinia augue. Sed malesuada
            justo enim, quis vulputate est imperdiet vitae. Praesent odio nunc,
            mollis vel blandit id, volutpat nec erat. Donec a congue nibh. Morbi
            ultrices, lacus eu interdum laoreet, odio tellus scelerisque elit,
            eget eleifend felis sem ac enim.
          </div>
          <div>
            Suspendisse imperdiet diam ac feugiat feugiat. Aliquam pulvinar
            vestibulum laoreet. Morbi sed sodales ex, non placerat ligula. Donec
            at viverra nisi. Vivamus neque massa, ultricies et enim sit amet,
            sodales lacinia massa. Sed rutrum risus a ipsum elementum venenatis.
            Praesent pharetra, nisi nec congue eleifend, nisi nibh interdum
            nibh, at sodales eros ex a lorem. Morbi et lectus non metus
            consectetur tincidunt nec a est. Aliquam aliquam lorem commodo sem
            congue consequat. Quisque mattis est id metus cursus luctus. Sed
            lobortis egestas lorem eget ultrices.
          </div>
          <div>
            Aliquam varius dapibus diam, at semper nibh tempus et. Quisque non
            egestas elit. Nulla tristique turpis id lorem placerat, eu laoreet
            ipsum pretium. Fusce ultrices pellentesque lorem, scelerisque cursus
            diam scelerisque a. Proin dictum et eros sit amet hendrerit.
            Curabitur scelerisque libero sit amet neque auctor, in pellentesque
            elit viverra. Vestibulum odio arcu, tempus quis felis vel, blandit
            accumsan odio. Fusce faucibus dignissim lacus, non dictum orci
            elementum in. Nulla maximus nisl vitae tortor tempor, sed iaculis
            quam interdum. Aliquam nibh diam, porta a sodales et, finibus id
            metus. Curabitur ornare viverra nulla, ac convallis nibh venenatis
            eu. Proin feugiat, urna non fermentum bibendum, dolor nibh
            pellentesque nisl, non condimentum nibh justo non massa. Proin
            placerat placerat libero eu molestie.
          </div>
          <div>
            Quisque quis quam tristique, vehicula magna vel, convallis eros. Nam
            elementum dictum tempus. Aenean luctus orci in diam ultricies
            fringilla. Vestibulum tempor orci quis feugiat vulputate. Sed
            aliquet, libero et efficitur vestibulum, leo quam tristique magna,
            sit amet rhoncus neque elit eu ex. Suspendisse lobortis lectus eu
            nibh commodo, eget imperdiet magna porta. Vestibulum non velit at
            urna ornare tristique. Nullam malesuada varius orci, id ultrices
            elit. Praesent molestie, arcu id tristique facilisis, nisi nulla
            mattis mi, nec laoreet sapien dui eu nisi. Fusce sit amet porttitor
            mauris. Etiam posuere, justo sit amet dapibus blandit, libero elit
            pharetra elit, et iaculis dui risus nec magna. Vestibulum a diam ex.
          </div>
        </div>
      </Container>
    </div>
  );
};
