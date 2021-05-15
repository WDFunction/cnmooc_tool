// ==UserScript==
// @name         CNMOOC摸鱼
// @version      2021.0515.01
// @description  章节导航页面自动浏览视频和文档，客观题页面自动填写答案
// @author       114514
// @match        https://cnmooc.org/study/initplay/*
// @match        https://cnmooc.org/examTest/stuExamList/*
// @match        https://cnmooc.org/portal/session/unitNavigation/*
// @match        https://*.cnmooc.org/study/initplay/*
// @match        https://*.cnmooc.org/examTest/stuExamList/*
// @match        https://*.cnmooc.org/portal/session/unitNavigation/*
// @grant        GM_notification
// @grant        GM.xmlHttpRequest
// @grant        unsafeWindow
// @require      https://cdn.jsdelivr.net/npm/axios@~0.21.1/dist/axios.min.js
// @require      https://cdn.jsdelivr.net/npm/axios-userscript-adapter@~0.1.2/dist/axiosGmxhrAdapter.min.js
// @require      https://cdn.jsdelivr.net/npm/qs@6.10.1/dist/qs.min.js
// @connect      cnmooc.org
// ==/UserScript==


(async () => {
  axios.defaults.adapter = axiosGmxhrAdapter;
  let paperStruct = [];
  let submitId = "";
  let testPaperId = 0;
  let courseOpenId = 0;
  let paperId = 0;
  let inited = false;


  ((open) => {
    const re = /https:\/\/(|.*)cnmooc.org\/examSubmit\/\d*\/getExamPaper-\d*_\d*_\d*\.mooc/;
    const re2 = /https:\/\/(|.*)cnmooc.org\/examSubmit\/\d*\/getExamPaper-.mooc/;
    XMLHttpRequest.prototype.open = function () {
      this.addEventListener(
        "readystatechange",
        function () {
          if (this.readyState == 4 && (re.test(this.responseURL) ||
            re2.test(this.responseURL)
          ) && !inited) {
            const parsed_json = JSON.parse(this.response);
            paperStruct = parsed_json.paper.paperStruct
            submitId = parsed_json.submitId
            testPaperId = parsed_json.testPaperId;
            courseOpenId = parsed_json.courseOpenId;
            paperId = parsed_json.examSubmit.paperId;

            if (!parsed_json.examSubmit.submitContent) {
              GM_notification({ title: '开始执行', text: '正在获取答案……' });
              console.warn('暂存为空', paperStruct)
              inited = true
              ltlcFunction()
            } else {
              let i = prompt("已有暂存内容，输入y继续执行")
              if (i === "y" || i === "Y") {
                inited = true
                ltlcFunction()
              } else {
                console.warn('已有暂存内容，跳过执行', paperStruct)
              }

            }
          }
        },
        false
      );
      open.apply(this, arguments);
    };
  })(XMLHttpRequest.prototype.open);
  async function ltlcFunction() {
    console.trace()
    let results = []
    const baseData = Qs.stringify({
      reSubmit: 0,
      submitFlag: 0,
      useTime: 40,
      totalScore: 10000,
      testPaperId
    })
    function maxValue(arr) {
      return arr.reduce((max, val) => max > val ? max : val)
    }
    let generateTries = (level = 4) => [...new Array(parseInt("1".repeat(level), 2) + 1).keys()].map(v => v.toString(2).padStart(4, "0").split('').map(v => Boolean(~~v)))
    let max = maxValue(paperStruct.map(v => v.quiz.quizOptionses.length))
    console.warn('max', max)
    console.warn('struct', paperStruct)
    // quizTypeId: itt002双选 itt003单选 itt004多选
    // #region 单选题
    for (let i = 0; i < max; i++) {
      let data = baseData + '&' + paperStruct.reduce((result, v) => {
        if (v.quiz.quizTypeId === "itt003" || v.quiz.quizTypeId === "itt002") {
          result += `submitquizs[]=` + encodeURIComponent(JSON.stringify({
            quizId: v.quiz.quizId,
            userAnswer: i < v.quiz.quizOptionses.length ? v.quiz.quizOptionses[i].optionId : ""
          })) + '&'
        } else if (v.quiz.quizTypeId === "itt004") {
          result += `submitquizs[]=` + encodeURIComponent(JSON.stringify({
            quizId: v.quiz.quizId,
            userAnswer: ""
          })) + '&'
        }
        return result
      }, "")

      let r = await axios({
        method: 'post',
        url: `/examSubmit/${courseOpenId}/saveExam/1/${paperId}/${submitId}.mooc?testPaperId=${testPaperId}`,
        data: data
      })
      console.warn('submit', r.data)
      let paper = await axios({
        method: 'post',
        url: `/examSubmit/${courseOpenId}/getExamPaper-${submitId}.mooc`,
        data: Qs.stringify({
          testPaperId, paperId, limitTime: -60, modelType: 'practice',
          examQuizNum: paperStruct.length, curSubmitNum: 1
        })
      })

      const quoted_answers = paper.data.examSubmit.submitContent;
      const raw_answers = JSON.parse(quoted_answers);
      raw_answers.forEach(v => {
        const parsed_item = JSON.parse(v);
        if (parsed_item.errorFlag === "right") {
          results.push(parsed_item)
        }
      })

      console.warn('paper', paper.data)
    }

    // #endregion

    // #region 多选
    let tries = generateTries(4)
    for (const doit of tries) {
      let data = baseData + '&' + paperStruct.reduce((result, v) => {
        if (v.quiz.quizTypeId === "itt003" || v.quiz.quizTypeId === "itt002") {
          result += `submitquizs[]=` + encodeURIComponent(JSON.stringify({
            quizId: v.quiz.quizId,
            userAnswer: ""
          })) + '&'
        } else if (v.quiz.quizTypeId === "itt004") {
          result += `submitquizs[]=` + encodeURIComponent(JSON.stringify({
            quizId: v.quiz.quizId,
            userAnswer: doit.map((whetherTry, tryIdx) => {
              if (!whetherTry) {
                return undefined
              }
              return v.quiz.quizOptionses[tryIdx].optionId
            }).filter(v => v).join(",")
          })) + '&'
        }
        return result
      }, "")
      console.log(doit)
      let r = await axios({
        method: 'post',
        url: `/examSubmit/${courseOpenId}/saveExam/1/${paperId}/${submitId}.mooc?testPaperId=${testPaperId}`,
        data: data
      })
      console.warn('submit', r.data)
      let paper = await axios({
        method: 'post',
        url: `/examSubmit/${courseOpenId}/getExamPaper-${submitId}.mooc`,
        data: Qs.stringify({
          testPaperId, paperId, limitTime: -60, modelType: 'practice',
          examQuizNum: paperStruct.length, curSubmitNum: 1
        })
      })

      const quoted_answers = paper.data.examSubmit.submitContent;
      const raw_answers = JSON.parse(quoted_answers);
      raw_answers.forEach(v => {
        const parsed_item = JSON.parse(v);
        if (parsed_item.errorFlag === "right") {
          results.push(parsed_item)
        }
      })

      console.warn('paper', paper.data)
    }
    // #endregion

    console.warn('results', results)
    let data = baseData + '&' + results.map(v => ({
      quizId: v.quizId,
      userAnswer: v.userAnswer
    })).map(v => `submitquizs[]=${encodeURIComponent(JSON.stringify(v))}`).join('&')
    let r = await axios({
      method: 'post',
      url: `/examSubmit/${courseOpenId}/saveExam/1/${paperId}/${submitId}.mooc?testPaperId=${testPaperId}`,
      data: data
    })
    console.warn('final submit', r.data)
    inited = false
    for (const v of results) {
      let parentDom = document.querySelector(`div[quiz_id='${v.quizId}']`)
      if (v.userAnswer.includes(",")) {
        let inputs = parentDom.querySelectorAll("div.test-options span > a")
        for (const input of [...inputs]) {
          if ([...input.classList].includes("selected")) {
            input.click()
          }
        }
        for (const optionId of v.userAnswer.split(",")) {
          document.querySelector(`div[option_id='${optionId}'] > span > a`).click()
        }
      } else {
        document.querySelector(`div[option_id='${v.userAnswer}'] > span > a`).click()
      }
    }
    /* 显示答案 todo
    let answerOuput = ""
    paperStruct.forEach(v => {
      let answer = results.find(result => result.quizId === v.quizId)
      v.quiz.quizOptionses.forEach((quiz, i) => {
        console.log(answer.userAnswer)
        if (~~quiz.optionId === ~~answer.userAnswer) {
          answerOuput += ('ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')[i])
        }
      })
    })
    document.querySelector(".tab-course-title").innerText = answerOuput*/
  }

  if (window.location.pathname.startsWith("/portal/session/unitNavigation")) {
    let videos = [...document.querySelectorAll("#unitNavigation a[itemtype='10']")].map(v => v.getAttribute("itemid")).filter(v => !document.querySelector(`a[itemid='${v}'] > i.icon-play-done`))
    console.log(videos)
    if (videos.length) {
      GM_notification({ title: '开始执行', text: '正在浏览视频……' });
    }
    for (const itemId of videos) {
      let r = await axios({
        url: '/study/updateDurationVideo.mooc',
        method: 'post',
        data: `itemId=${itemId}&isOver=2&currentPosition=0&duration=0`
      })
      console.log(itemId, r.data)
    }
    for (const itemId of videos) {
      let r = await axios({
        url: '/study/update/item.mooc',
        method: 'post',
        data: `itemId=${itemId}`
      })
      console.log(itemId, r.data)
    }
    if (videos.length) {
      alert("已完成未观看的视频")
    }

    let docs = [...document.querySelectorAll("#unitNavigation a[itemtype='20']")].map(v => v.getAttribute("itemid")).filter(v => !document.querySelector(`a[itemid='${v}'] > i.icon-doc-done`))
    console.log(docs)
    if (docs.length) {
      GM_notification({ title: '开始执行', text: '正在浏览文档……' });
    }
    for (const itemId of docs) {
      let r = await axios({
        url: '/study/updateDurationDoc.mooc',
        method: 'post',
        data: `itemId=${itemId}&isOver=2&duration=0`
      })
      console.log(itemId, r.data)
    }
    if (docs.length) {
      alert("已完成未阅读的文档")
    }
  }
})();
